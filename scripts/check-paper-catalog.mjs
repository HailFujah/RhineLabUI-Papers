import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const json = async file => JSON.parse(await readFile(`content/${file}.json`, "utf8"));
const [catalog, index, seeds, samples, provenance] = await Promise.all([
  "paper-catalog", "paper-index", "paper-seeds", "papers", "paper-provenance",
].map(json));
const papers = { ...samples, ...index };
assert.equal(catalog.length, 1000);
assert.equal(Object.keys(index).length, 995);
assert.deepEqual(catalog.slice(0, 5), seeds, "Original IDs, PDFs and revisions must survive expansion");
assert.equal(new Set(catalog.map(p => p.id)).size, catalog.length);
assert.equal(new Set(catalog.map(p => p.slug)).size, catalog.length);
assert.equal(new Set(catalog.map(p => p.metadata)).size, catalog.length);
const titles = new Set(), identifiers = new Set(), dois = new Set(), venues = {};
const hosts = new Set(["arxiv.org", "papers.nips.cc", "aclanthology.org", "openaccess.thecvf.com", "raw.githubusercontent.com"]);
for (const entry of catalog) {
  assert.match(entry.id, /^paper:[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/);
  assert.match(entry.slug, /^[a-z0-9-]+$/);
  const pdf = new URL(entry.pdf);
  assert.equal(pdf.protocol, "https:"); assert.ok(hosts.has(pdf.hostname));
  if (pdf.hostname === "raw.githubusercontent.com") assert.ok(pdf.pathname.startsWith("/mlresearch/v267/"));
  if (pdf.hostname === "arxiv.org") assert.match(pdf.pathname, /^\/pdf\/\d{4}\.\d{4,5}v\d+$/);
  const paper = papers[entry.metadata]; assert.ok(paper, entry.metadata);
  const title = paper.title.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  assert.ok(!titles.has(title), `Duplicate title: ${paper.title}`); titles.add(title);
  assert.ok(paper.authors.length && paper.authors.every(a => typeof a === "string" && a.trim()));
  assert.ok(paper.abstract.length > 100, `Missing original abstract: ${paper.title}`);
  assert.match(paper.published, /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/);
  assert.ok(paper.published <= provenance.cutoff);
  if (paper.arxivId) { assert.ok(!identifiers.has(paper.arxivId)); identifiers.add(paper.arxivId); }
  if (paper.doi) { const doi = paper.doi.toLowerCase(); assert.ok(!dois.has(doi)); dois.add(doi); }
  if (index[entry.metadata]) {
    assert.ok(paper.source.id && new URL(paper.source.url).protocol === "https:");
    assert.ok(["published", "first-submitted"].includes(paper.dateKind));
    assert.ok(!Object.hasOwn(paper, "references"), "Unknown references must remain lazily loadable");
  }
  venues[paper.venue] = (venues[paper.venue] ?? 0) + 1;
}
assert.deepEqual(venues, provenance.venues);
assert.equal(Object.values(provenance.selectionCounts).reduce((a, b) => a + b, 0), catalog.length);
assert.ok(index["acl-anthology-2025-acl-long-1"].authors.includes("Weiqi Wang"));
assert.ok(index["acl-anthology-2025-acl-long-1"].institutions.includes("Amazon"));
assert.match(index["arxiv-2005-14165"].title, /Language Models are Few-Shot Learners/i);
assert.match(index["arxiv-2303-08774"].title, /GPT-4/i);
console.log("Catalog integrity: 1,000 stable identities, original abstracts, unique identifiers, pinned PDF sources, dates and venue counts checked.");
