import catalog from "../content/paper-catalog.json" with { type: "json" };
const sources = new Map(catalog.map(paper => [paper.slug, paper]));

/** Only catalogued official PDFs are reachable. No caller-supplied URL/proxy. */
export async function servePaper(slug: string, signal?: AbortSignal): Promise<Response> {
  const entry = sources.get(slug);
  if (!entry) return new Response("Unknown paper", { status: 404 });
  try {
    const response = await fetch(entry.pdf, { signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(90_000)]), redirect: "follow" });
    if (!response.ok || !response.body) return new Response("Official PDF unavailable", { status: 502 });
    const type = response.headers.get("content-type") ?? "";
    if (!/pdf|octet-stream/i.test(type)) return new Response("Source did not return a PDF", { status: 502 });
    if (Number(response.headers.get("content-length")) > 100 * 1024 * 1024) return new Response("PDF too large", { status: 413 });
    const headers = new Headers({ "Content-Type": "application/pdf", "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" });
    // Bound actual bytes too: some publishers use chunked responses without Content-Length.
    let bytes = 0;
    const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, controller) {
      bytes += chunk.byteLength;
      if (bytes > 100 * 1024 * 1024) { controller.error(new Error("PDF too large")); return; }
      controller.enqueue(chunk);
    } }));
    return new Response(body, { headers });
  } catch { return new Response("Official PDF unavailable; retry or import a local PDF", { status: 502 }); }
}
