import { cachePaperFile, fileHash, storedPaperFile, type StoredPaper } from "./paper-library";

type Job = { controller: AbortController; promise: Promise<Blob>; users: number };
const jobs = new Map<string, Job>();
const MAX_BYTES = 100 * 1024 * 1024;

async function acquire(paper: StoredPaper, signal: AbortSignal): Promise<Blob> {
  signal.throwIfAborted();
  const local = await storedPaperFile(paper.id);
  signal.throwIfAborted();
  if (local && local.revision === (paper.pdfRevision ?? "local")) return local.file;
  if (!paper.pdfUrl) throw new Error("本地 PDF 不可用，请重新导入原文件。");
  const response = await fetch(paper.pdfUrl, { signal, credentials: "same-origin" });
  if (!response.ok) throw new Error(`首次下载 PDF 失败（HTTP ${response.status}），请联网重试或导入原文件。`);
  if (Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error("PDF 超过本轮支持的 100 MiB，请导入本地文件。");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("PDF 下载内容为空。");
  const chunks: Uint8Array<ArrayBuffer>[] = []; let bytes = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) throw new Error("PDF 超过 100 MiB，请导入本地文件。");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const file = new Blob(chunks, { type: "application/pdf" });
  if (!(await file.slice(0, 1024).text()).includes("%PDF-") || !(await file.slice(-2048).text()).includes("%%EOF"))
    throw new Error("下载结果不是完整 PDF，未保存，请重试。");
  signal.throwIfAborted();
  const hash = await fileHash(file); signal.throwIfAborted();
  try { await cachePaperFile(paper, file, hash, signal); }
  catch (error) { if (signal.aborted) throw signal.reason; throw new Error("PDF 已下载，但本地保存失败。请检查浏览器存储空间或权限后重试。", { cause: error }); }
  return file;
}

/** Share in-flight reads only, then release the Blob. Other tabs coordinate via Web Locks. */
export function paperFile(paper: StoredPaper, signal: AbortSignal): Promise<Blob> {
  signal.throwIfAborted();
  const key = `${paper.id}:${paper.pdfRevision ?? "local"}`;
  let job = jobs.get(key);
  if (!job || job.controller.signal.aborted) {
    const controller = new AbortController();
    const fetchSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(120_000)]);
    const promise = Promise.resolve(navigator.locks
      ? navigator.locks.request(`rhine-pdf:${key}`, { signal: fetchSignal }, () => acquire(paper, fetchSignal))
      : acquire(paper, fetchSignal));
    job = { controller, promise, users: 0 }; jobs.set(key, job);
    const current = job;
    void promise.finally(() => { if (jobs.get(key) === current) jobs.delete(key); }).catch(() => {});
  }
  const current = job; current.users++;
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = () => {
      if (done) return false; done = true; signal.removeEventListener("abort", abort);
      if (--current.users === 0) current.controller.abort(); return true;
    };
    const abort = () => { if (finish()) reject(signal.reason); };
    signal.addEventListener("abort", abort, { once: true });
    current.promise.then(file => { if (finish()) resolve(file); }, error => { if (finish()) reject(error); });
  });
}
