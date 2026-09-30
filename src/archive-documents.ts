import type { StoredPaper } from "./paper-library";
import { paperFile } from "./paper-files";
export type ArchiveDocument = { title: string; url: string; source?: string; sample?: boolean; paper?: StoredPaper };
const documents = new Map<string, StoredPaper>();
export function setLibraryDocuments(papers: StoredPaper[]) {
  documents.clear();
  papers.forEach(paper => documents.set(paper.id, paper));
}

export function archiveDocument(id: string): ArchiveDocument | undefined {
  const paper = documents.get(id);
  return paper ? { title: paper.paper.title, url: paper.pdfUrl || `local:${paper.id}`, source: paper.paper.url, paper } : undefined;
}
export async function documentFile(document: ArchiveDocument, signal: AbortSignal) {
  if (!document.paper) throw new Error("论文尚未归档，请选择本地 PDF。");
  return paperFile(document.paper, signal);
}
