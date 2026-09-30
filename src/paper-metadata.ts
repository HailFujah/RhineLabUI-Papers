import samples from "../content/papers.json" with { type: "json" };

export interface PaperMetadata {
  title: string;
  translatedTitle: string;
  authors: string[];
  institutions: string[];
  published: string;
  venue: string;
  fields: string[];
  keywords: string[];
  doi: string;
  doiKind?: string;
  abstract: string;
  abstractLabel?: string;
  url: string;
  publicationUrl?: string;
  references?: string[];
  arxivId?: string;
  /** A preprint submission date must not be presented as conference acceptance. */
  dateKind?: string;
  journalReference?: string;
  source?: { provider: string; id: string; url: string };
}

export const samplePapers: Readonly<Record<string, PaperMetadata>> = samples;

export function paperUrl(value: string) {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : ""; }
  catch { return ""; }
}
