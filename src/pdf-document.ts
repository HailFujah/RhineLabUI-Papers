import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist/types/src/display/api";
import { assetUrl } from "./asset-url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
export type PdfRaster = { canvas: HTMLCanvasElement; width: number; height: number };
const aborted = () => new DOMException("PDF request cancelled", "AbortError");
export const isPdfCancellation = (error: unknown) => error instanceof Error &&
  ["AbortError", "RenderingCancelledException"].includes(error.name);
export function releaseRaster(raster?: PdfRaster) {
  if (raster) raster.canvas.width = raster.canvas.height = 1;
}

/** Bounded callers own rasters; no implicit cache of full resolution pages. */
export class PdfDocument {
  private tasks = new Set<RenderTask>();
  private dead = false;
  private constructor(readonly pdf: PDFDocumentProxy) {}
  static async load(source: string | Uint8Array, signal: AbortSignal) {
    if (signal.aborted) throw aborted();
    const task = pdfjs.getDocument({
      ...(typeof source === "string" ? { url: source } : { data: source }),
      cMapUrl: assetUrl(`pdfjs/${pdfjs.version}/cmaps/`),
      cMapPacked: true,
      standardFontDataUrl: assetUrl(`pdfjs/${pdfjs.version}/standard_fonts/`),
      wasmUrl: assetUrl(`pdfjs/${pdfjs.version}/wasm/`),
    });
    const cancel = () => { void task.destroy().catch(() => {}); };
    signal.addEventListener("abort", cancel, { once: true });
    try {
      const pdf = await task.promise;
      if (signal.aborted) { void pdf.destroy(); throw aborted(); }
      return new PdfDocument(pdf);
    } catch (error) {
      void task.destroy().catch(() => {});
      throw error;
    } finally { signal.removeEventListener("abort", cancel); }
  }
  get pageCount() { return this.pdf.numPages; }
  async raster(pageNumber: number, requestedWidth: number, maxPixels: number, maxSide: number, signal: AbortSignal): Promise<PdfRaster> {
    if (this.dead || signal.aborted) throw aborted();
    const page = await this.pdf.getPage(pageNumber);
    if (this.dead || signal.aborted) throw aborted();
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(requestedWidth / base.width,
      Math.sqrt(maxPixels / (base.width * base.height)), maxSide / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const task = page.render({ canvas, viewport, background: "#ffffff" });
    this.tasks.add(task);
    const cancel = () => task.cancel();
    signal.addEventListener("abort", cancel, { once: true });
    try {
      await task.promise;
      if (this.dead || signal.aborted) throw aborted();
      return { canvas, width: base.width, height: base.height };
    } catch (error) { canvas.width = canvas.height = 1; throw error; }
    finally {
      signal.removeEventListener("abort", cancel);
      this.tasks.delete(task);
      page.cleanup();
    }
  }
  destroy() {
    if (this.dead) return;
    this.dead = true;
    for (const task of this.tasks) task.cancel();
    this.tasks.clear();
    void this.pdf.destroy().catch(() => {});
  }
}
