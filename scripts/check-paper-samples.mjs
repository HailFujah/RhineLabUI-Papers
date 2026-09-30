import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "vite";

// Optional integration check using locally downloaded official PDFs, never committed.
// Only the DOM-oriented PDF loading wrapper is adapted; text extraction is the production module.
const directory = resolve("verification/fixtures/paper-samples-check");
await mkdir(directory, { recursive: true });
const adapter = `${directory}/node-document.ts`;
await writeFile(adapter, `import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
export const PdfDocument = { async load(source, signal) {
  signal.throwIfAborted(); const task = getDocument({ data: source, useSystemFonts: true });
  const pdf = await task.promise; return { pdf, pageCount: pdf.numPages, destroy: () => void pdf.destroy() };
}};`);
await build({ configFile: false, logLevel: "error", plugins: [{ name: "node-pdf-text-only", enforce: "pre", resolveId(source) { if (source === "./pdf-document") return adapter; } }],
  build: { lib: { entry: resolve("src/paper-import.ts"), formats: ["es"], fileName: () => "inspect.mjs" },
    rollupOptions: { external: ["pdfjs-dist/legacy/build/pdf.mjs"] }, outDir: directory, emptyOutDir: false, minify: false } });
const { inspectPaper } = await import(pathToFileURL(`${directory}/inspect.mjs`).href);
const catalog = JSON.parse(await readFile("content/paper-catalog.json", "utf8"));
const counts = { "attention-2017": [11, 32], "bert-2019": [16, 64], "resnet-2016": [9, 49], "gan-2014": [9, 29], "ddpm-2020": [12, 72] };
for (const entry of catalog.filter(entry => Object.hasOwn(counts, entry.slug))) {
  const bytes = new Uint8Array(await readFile(`verification/fixtures/${entry.slug}.pdf`));
  const { paper, pages } = await inspectPaper(bytes, `${entry.slug}.pdf`, new AbortController().signal);
  await writeFile(`${directory}/${entry.slug}.json`, JSON.stringify({ paper, pages }, null, 2));
  console.log(entry.slug, { pages, abstractCharacters: paper.abstract.length, references: paper.references.length, abstractEnd: paper.abstract.slice(-100) });
  assert.equal(pages, counts[entry.slug][0]); assert.ok(paper.abstract.length > 400, `${entry.slug}: missing abstract`);
  assert.equal(paper.references.length, counts[entry.slug][1], `${entry.slug}: reference boundary regression`);
}
