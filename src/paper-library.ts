import type { PaperMetadata } from "./paper-metadata";
import { catalogPapers } from "./paper-catalog";

export interface StoredPaper {
  id: string;
  paper: PaperMetadata;
  /** Only an unsaved import carries a Blob. Directory reads never load PDF bytes. */
  file?: Blob;
  filename: string;
  hash: string;
  importedAt: string;
  pages: number;
  pdfUrl?: string;
  pdfRevision?: string;
  cached?: boolean;
}

export interface PaperFile { id: string; file: Blob; hash: string; revision: string; savedAt: string }

let database: Promise<IDBDatabase> | undefined;
function openDatabase() {
  if (database) return database;
  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open("rhine-paper-library", 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      const papers = db.objectStoreNames.contains("papers") ? request.transaction!.objectStore("papers") : db.createObjectStore("papers", { keyPath: "id" });
      const files = db.createObjectStore("files", { keyPath: "id" });
      papers.createIndex("hash", "hash", { unique: false });
      // One atomic upgrade preserves v1 imports and identities without loading
      // every PDF into the directory again on subsequent application starts.
      const cursor = papers.openCursor();
      cursor.onsuccess = () => {
        const item = cursor.result;
        if (!item) return;
        const { file, ...record } = item.value as StoredPaper;
        if (file) files.put({ id: record.id, file, hash: record.hash, revision: record.pdfRevision ?? "local", savedAt: record.importedAt });
        item.update({ ...record, cached: !!file }); item.continue();
      };
    };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) { db.close(); return; }
      db.onversionchange = () => { db.close(); database = undefined; };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => { blocked = true; reject(new Error("请关闭其他正在打开论文库的页面后重试。")); };
  });
  database = pending;
  void pending.catch(() => { if (database === pending) database = undefined; });
  return pending;
}

export async function storedPapers(): Promise<StoredPaper[]> {
  const seeds = await catalogPapers();
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("papers", "readonly");
    const request = transaction.objectStore("papers").getAll();
    transaction.oncomplete = () => {
      const records = new Map(seeds.map(paper => [paper.id, paper]));
      for (const paper of request.result as StoredPaper[]) {
        const seed = records.get(paper.id);
        records.set(paper.id, seed ? { ...paper, pdfUrl: seed.pdfUrl, pdfRevision: seed.pdfRevision } : paper);
      }
      resolve([...records.values()].sort((a, b) => a.importedAt.localeCompare(b.importedAt)));
    };
    transaction.onerror = transaction.onabort = () => reject(transaction.error ?? request.error);
  });
}

export async function storePaper(record: StoredPaper) {
  const db = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(["papers", "files"], "readwrite");
    const { file, ...metadata } = record;
    const papers = transaction.objectStore("papers"), request = papers.get(record.id);
    request.onsuccess = () => {
      const previous = request.result as StoredPaper | undefined;
      papers.put({ ...metadata, ...(!file && previous ? { hash: previous.hash, cached: previous.cached, pages: previous.pages } : {}),
        ...(file ? { cached: true } : {}) });
    };
    if (file) transaction.objectStore("files").put({ id: record.id, file, hash: record.hash, revision: record.pdfRevision ?? "local", savedAt: new Date().toISOString() });
    transaction.oncomplete = () => resolve();
    transaction.onerror = transaction.onabort = () => reject(transaction.error);
  });
}

export async function fileHash(file: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
}

/** Replace only the superseded sample summary or a missing abstract. */
export async function saveExtractedText(id: string, text: Pick<PaperMetadata, "abstract" | "references">, pages: number) {
  if (!id.startsWith("paper:")) return;
  const db = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("papers", "readwrite");
    const store = transaction.objectStore("papers");
    const request = store.get(id);
    request.onsuccess = () => {
      const record = request.result as StoredPaper | undefined;
      if (record) {
        const paper = { ...record.paper };
        if (!paper.abstract || paper.abstractLabel === "中文概述") { paper.abstract = text.abstract; paper.abstractLabel = "原文摘要"; }
        paper.references ??= text.references;
        store.put({ ...record, paper, pages });
      }
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = transaction.onabort = () => reject(transaction.error ?? request.error);
  });
}

export async function storedPaperFile(id: string): Promise<PaperFile | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("files", "readonly"), request = tx.objectStore("files").get(id);
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () => reject(tx.error ?? request.error);
  });
}

/** Commit the complete verified file before advertising it as available offline. */
export async function cachePaperFile(record: StoredPaper, file: Blob, hash: string, signal: AbortSignal) {
  const db = await openDatabase(); signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["papers", "files"], "readwrite");
    const abort = () => tx.abort(); signal.addEventListener("abort", abort, { once: true });
    const papers = tx.objectStore("papers"), request = papers.get(record.id);
    request.onsuccess = () => {
      const { file: _, ...metadata } = (request.result ?? record) as StoredPaper;
      papers.put({ ...metadata, pdfUrl: record.pdfUrl, pdfRevision: record.pdfRevision, hash, cached: true });
      tx.objectStore("files").put({ id: record.id, file, hash, revision: record.pdfRevision ?? "local", savedAt: new Date().toISOString() });
    };
    tx.oncomplete = () => { signal.removeEventListener("abort", abort); resolve(); };
    tx.onerror = tx.onabort = () => { signal.removeEventListener("abort", abort); reject(signal.aborted ? signal.reason : tx.error ?? request.error); };
  });
}

export async function requestPaperPersistence() {
  try { return await navigator.storage?.persist?.() ?? false; } catch { return false; }
}

export type ReadingVisit = { time: string; page: number; pages: number };
export function readingVisits(id: string): ReadingVisit[] {
  try {
    const entries: unknown = JSON.parse(localStorage.getItem(`rhine-reading:${id}`) ?? "[]");
    return Array.isArray(entries) ? entries.filter(entry => entry && typeof entry.time === "string" && Number.isInteger(entry.page) && Number.isInteger(entry.pages)).slice(0, 12) : [];
  } catch { return []; }
}
export function recordReading(id: string, page: number, pages: number) {
  const visits = readingVisits(id);
  const visit = { time: new Date().toISOString(), page, pages };
  if (visits[0]?.page === page) visits[0] = visit; else visits.unshift(visit);
  try { localStorage.setItem(`rhine-reading:${id}`, JSON.stringify(visits.slice(0, 12))); } catch { /* PDF reading remains available. */ }
}
