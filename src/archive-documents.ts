import type { StoredPaper } from "./paper-library";
export type ArchiveDocument = { title: string; url: string; source?: string; sample?: boolean };
const documents = new Map<string, StoredPaper>();
const urls = new Map<string, string>();
export function setLibraryDocuments(papers: StoredPaper[]) {
  urls.forEach(url => URL.revokeObjectURL(url)); urls.clear(); documents.clear();
  papers.forEach(paper => documents.set(paper.id, paper));
}

/** The paper is a labelled test attachment, separate from the fictional archive. */
export function archiveDocument(id: string): ArchiveDocument | undefined {
  const paper = documents.get(id);
  if (paper) {
    let url = urls.get(id);
    if (!url) { url = URL.createObjectURL(paper.file); urls.set(id, url); }
    return { title: paper.paper.title, url, source: paper.paper.url };
  }
  if (id !== "X-001") return undefined;
  return {
    title: "Attention Is All You Need",
    url: import.meta.env.DEV ? "/verification/fixtures/attention-is-all-you-need.pdf" : "https://arxiv.org/pdf/1706.03762",
    source: "https://arxiv.org/abs/1706.03762",
    sample: true,
  };
}
