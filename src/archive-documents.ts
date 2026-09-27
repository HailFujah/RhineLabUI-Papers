export type ArchiveDocument = { title: string; url: string; source?: string; sample?: boolean };

/** The paper is a labelled test attachment, separate from the fictional archive. */
export function archiveDocument(id: string): ArchiveDocument | undefined {
  if (id !== "X-001") return undefined;
  return {
    title: "Attention Is All You Need",
    url: import.meta.env.DEV ? "/verification/fixtures/attention-is-all-you-need.pdf" : "https://arxiv.org/pdf/1706.03762",
    source: "https://arxiv.org/abs/1706.03762",
    sample: true,
  };
}
