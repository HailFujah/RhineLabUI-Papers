import type { PaperMetadata } from "./paper-metadata";

export interface StoredPaper {
  id: string;
  paper: PaperMetadata;
  file: Blob;
  filename: string;
  hash: string;
  importedAt: string;
  pages: number;
}

let database: Promise<IDBDatabase> | undefined;
function openDatabase() {
  if (database) return database;
  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open("rhine-paper-library", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("papers", { keyPath: "id" });
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
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("papers", "readonly");
    const request = transaction.objectStore("papers").getAll();
    transaction.oncomplete = () => resolve((request.result as StoredPaper[]).sort((a, b) => a.importedAt.localeCompare(b.importedAt)));
    transaction.onerror = transaction.onabort = () => reject(transaction.error ?? request.error);
  });
}

export async function storePaper(record: StoredPaper) {
  const db = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("papers", "readwrite");
    transaction.objectStore("papers").put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = transaction.onabort = () => reject(transaction.error);
  });
}

export async function fileHash(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
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
