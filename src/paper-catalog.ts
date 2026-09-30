import catalog from "../content/paper-catalog.json" with { type: "json" };
import { samplePapers } from "./paper-metadata";
import type { StoredPaper } from "./paper-library";
import { assetUrl } from "./asset-url";

/** Metadata only; startup never downloads the catalog's PDF files. */
export function catalogPapers(): StoredPaper[] {
  return catalog.map(entry => ({ id: entry.id, paper: structuredClone(samplePapers[entry.metadata]),
    filename: `${entry.slug}.pdf`, hash: "", importedAt: "2026-09-29T00:00:00.000Z", pages: 0,
    pdfUrl: assetUrl(`api/papers/${entry.slug}`), pdfRevision: entry.revision, cached: false }));
}
