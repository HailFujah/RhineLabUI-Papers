import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "vite";
import { indexedDB, IDBKeyRange } from "fake-indexeddb";

// Exercises production modules against a fresh in-memory IDB; never opens a user's browser database.
Object.assign(globalThis, { indexedDB, IDBKeyRange });
const directory = resolve("verification/fixtures/paper-cache-check");
await mkdir(directory, { recursive: true });
const source = name => JSON.stringify(resolve(`src/${name}.ts`).replaceAll("\\", "/"));
await writeFile(`${directory}/entry.ts`, ["paper-library", "paper-files", "paper-catalog", "data", "archive-documents", "archive-loop"].map((name, i) => `export * as m${i} from ${source(name)};`).join("\n"));
await build({ configFile: false, logLevel: "error", define: { __RHINE_MODELS__: "{}" },
  build: { lib: { entry: `${directory}/entry.ts`, formats: ["es"], fileName: () => "check.mjs" }, outDir: directory, emptyOutDir: false, minify: false } });
const entry = pathToFileURL(`${directory}/check.mjs`).href;
const fixture = new Blob(["%PDF-1.7\ncache fixture\n%%EOF\n"], { type: "application/pdf" });
const paper = id => ({ id: `paper:test-${id}`, filename: `${id}.pdf`, hash: "", importedAt: "2026-09-29T00:00:00Z", pages: 1,
  pdfUrl: `/api/papers/${id}`, pdfRevision: "test-v1", paper: { title: id, translatedTitle: "", authors: [], institutions: [], published: "2020", venue: "Test", fields: [], keywords: [], doi: "", url: "", abstract: "" } });
const legacy = { ...paper("legacy"), file: fixture, pdfUrl: undefined, pdfRevision: undefined, hash: "legacy-hash" };
const v1 = await new Promise((resolve, reject) => {
  const request = indexedDB.open("rhine-paper-library", 1);
  request.onupgradeneeded = () => request.result.createObjectStore("papers", { keyPath: "id" }).put(legacy);
  request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
});
v1.close();
const { m0: library, m1: files, m2: catalog, m3: data, m4: attachments, m5: loop } = await import(entry);
const signal = () => new AbortController().signal;

test("v1 migration preserves identity and bytes; directory excludes every Blob", async () => {
  const records = await library.storedPapers();
  assert.equal(records.length, (await catalog.catalogPapers()).length + 1);
  assert.ok(records.every(record => !Object.hasOwn(record, "file")));
  assert.equal(records.find(record => record.id === legacy.id).hash, legacy.hash);
  const cached = await library.storedPaperFile(legacy.id);
  assert.equal(await cached.file.text(), await fixture.text());
  assert.equal(cached.revision, "local");
});
test("three paper columns keep chronological vertical cells and independent horizontal categories", async () => {
  const seeds = await catalog.catalogPapers();
  assert.equal(seeds.length, 1000); assert.equal(new Set(seeds.map(item => item.id)).size, 1000);
  data.usePaperLibrary(seeds);
  assert.deepEqual(data.archiveColumns, ["代表论文", "ACL／ICML 会议论文", "近期 arXiv 论文"]);
  assert.deepEqual(data.archiveColumns.map((_, i) => data.columnFiles(i).length), [100, 400, 500]);
  const dateKey = value => { const [y, m = "00", d = "00"] = value.split("-"); return `${y}-${m}-${d}`; };
  for (let group = 0; group < 3; group++) {
    const indices = data.columnFiles(group);
    assert.deepEqual(indices.map(i => dateKey(data.records[i].date)), indices.map(i => dateKey(data.records[i].date)).sort());
    for (const direction of [-1, 1]) {
      let index = indices[0], cell = data.fileLocation(index);
      for (let step = 0; step < 3200; step++) {
        index = indices[loop.wrap(indices.indexOf(index) + direction, indices.length)];
        const next = loop.selectionCell(index, cell, { axis: "row", direction });
        assert.equal(next.lane, cell.lane, "Vertical movement must never choose another category");
        assert.equal(next.row, cell.row + direction);
        assert.equal(loop.fileAtCell(next), index);
        const shift = loop.rebaseShift(next);
        const rebased = { lane: next.lane - shift.lane, row: next.row - shift.row };
        for (let offset = -3; offset <= 3; offset++) {
          assert.equal(loop.fileAtCell({ ...next, lane: next.lane + offset }), loop.fileAtCell({ ...rebased, lane: rebased.lane + offset }));
        }
        cell = rebased;
      }
    }
    assert.equal(data.records[indices[0]].displayId, "X-001");
  }
  let cell = data.fileLocation(data.columnFiles(0)[17]);
  const memory = [data.columnFiles(0)[17], data.columnFiles(1)[123], data.columnFiles(2)[456]];
  for (let step = 1; step < 10; step++) {
    const index = memory[step % 3];
    const next = loop.selectionCell(index, cell, { axis: "lane", direction: 1 });
    assert.equal(next.lane, cell.lane + 1); assert.equal(loop.fileAtCell(next), index); cell = next;
  }
  // Old cached directories receive the catalogue's grouping without losing edits.
  await library.storePaper({ ...seeds[0], collection: undefined, paper: { ...seeds[0].paper, title: "My edited title" } });
  const restored = (await library.storedPapers()).find(item => item.id === seeds[0].id);
  assert.equal(restored.collection, "classic"); assert.equal(restored.paper.title, "My edited title");
  attachments.setLibraryDocuments(seeds);
  assert.equal(attachments.archiveDocument("X-001"), undefined);
  assert.ok(attachments.archiveDocument(seeds[0].id).paper);
  data.useArchiveLibrary(); assert.equal(data.records.length, 40);
  assert.ok(data.records.every(record => !record.paper));
});
test("concurrent opens download once, persist before return, survive new module session offline", async () => {
  let requests = 0;
  globalThis.fetch = async () => { requests++; return new Response(fixture); };
  const item = paper("once");
  const [a, b] = await Promise.all([files.paperFile(item, signal()), files.paperFile(item, signal())]);
  assert.equal(requests, 1); assert.equal(a.size, b.size);
  assert.equal((await library.storedPaperFile(item.id)).file.size, fixture.size);
  const fresh = await import(`${entry}?new-session=1`);
  globalThis.fetch = async () => { throw Error("OFFLINE: no network request is permitted"); };
  assert.equal((await fresh.m1.paperFile(item, signal())).size, fixture.size);
  await library.saveExtractedText(item.id, { abstract: "original abstract", references: ["reference"] }, 9);
  const stored = (await library.storedPapers()).find(row => row.id === item.id);
  assert.equal(stored.pages, 9); assert.equal(stored.paper.abstract, "original abstract");
  await library.storePaper({ ...stored, paper: { ...stored.paper, abstract: "manual edit" } });
  await library.saveExtractedText(item.id, { abstract: "replacement", references: [] }, 9);
  assert.equal((await library.storedPapers()).find(row => row.id === item.id).paper.abstract, "manual edit");
});
test("one caller cancelling does not cancel another; all cancelling saves nothing", async () => {
  let release, started;
  const ready = new Promise(resolve => { started = resolve; });
  globalThis.fetch = async (_url, { signal }) => { started(); return new Promise((resolve, reject) => {
    release = () => resolve(new Response(fixture)); signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  }); };
  const first = new AbortController(), second = new AbortController(), item = paper("shared");
  const a = files.paperFile(item, first.signal), b = files.paperFile(item, second.signal);
  await ready; first.abort(); await assert.rejects(a, { name: "AbortError" }); release();
  assert.equal((await b).size, fixture.size);
  const cancel = new AbortController(), abandoned = paper("abandoned");
  const promise = files.paperFile(abandoned, cancel.signal); cancel.abort();
  await assert.rejects(promise, { name: "AbortError" });
  assert.equal(await library.storedPaperFile(abandoned.id), undefined);
});
test("HTTP errors, HTML and truncated files never become cached PDFs; retry succeeds", async () => {
  const item = paper("retry");
  for (const response of [new Response("offline", { status: 503 }), new Response("<html>error</html>"), new Response("%PDF-1.7\ntruncated")]) {
    globalThis.fetch = async () => response;
    await assert.rejects(files.paperFile(item, signal()));
    assert.equal(await library.storedPaperFile(item.id), undefined);
  }
  globalThis.fetch = async () => new Response(fixture);
  assert.equal((await files.paperFile(item, signal())).size, fixture.size);
});
test("a new source revision refetches; imports and metadata edits retain local bytes", async () => {
  let requests = 0; globalThis.fetch = async () => { requests++; return new Response(fixture); };
  await files.paperFile({ ...paper("once"), pdfRevision: "test-v2" }, signal());
  assert.equal(requests, 1);
  const revised = (await library.storedPapers()).find(row => row.id === paper("once").id);
  assert.equal(revised.pdfRevision, "test-v2");
  await files.paperFile(revised, signal()); assert.equal(requests, 1);
  const imported = { ...paper("imported"), file: fixture, pdfUrl: undefined, pdfRevision: undefined };
  await library.storePaper(imported);
  const record = (await library.storedPapers()).find(row => row.id === imported.id);
  await library.storePaper({ ...record, paper: { ...record.paper, title: "Edited" } });
  globalThis.fetch = async () => { throw Error("must stay local"); };
  assert.equal((await files.paperFile(record, signal())).size, fixture.size);
});
