import { test } from "node:test";
import assert from "node:assert/strict";
import { servePaper } from "../server/paper-source.ts";

test("download route accepts catalog slugs only and rejects non-PDF/error responses", async () => {
  let requests = 0;
  globalThis.fetch = async () => { requests++; return new Response("error", { status: 404 }); };
  assert.equal((await servePaper("https://example.org/file.pdf")).status, 404);
  assert.equal(requests, 0);
  assert.equal((await servePaper("attention-2017")).status, 502);
  globalThis.fetch = async () => new Response("<html>login</html>", { headers: { "Content-Type": "text/html" } });
  assert.equal((await servePaper("attention-2017")).status, 502);
  globalThis.fetch = async () => new Response("", { headers: { "Content-Type": "application/pdf", "Content-Length": "104857601" } });
  assert.equal((await servePaper("attention-2017")).status, 413);
});
test("download route streams exact bytes from its fixed official URL", async () => {
  const bytes = new TextEncoder().encode("%PDF-1.7\nfixture\n%%EOF");
  globalThis.fetch = async url => {
    assert.equal(url, "https://aclanthology.org/N19-1423.pdf");
    return new Response(bytes, { headers: { "Content-Type": "application/pdf" } });
  };
  const response = await servePaper("bert-2019");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "application/pdf");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
});
