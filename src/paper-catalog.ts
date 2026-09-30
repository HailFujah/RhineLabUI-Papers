import { samplePapers } from "./paper-metadata";
import type { PaperMetadata } from "./paper-metadata";
import type { StoredPaper } from "./paper-library";
import { assetUrl } from "./asset-url";
import type { PaperCollection } from "./paper-collections";

/** Metadata only; startup never downloads the catalog's PDF files. */
export async function catalogPapers(): Promise<StoredPaper[]> {
  // Separate lazy chunks keep the starter library out of the boot/game bundle.
  // Native module caching shares the metadata load, never PDF bytes.
  const [{ default: catalog }, { default: index }] = await Promise.all([
    import("../content/paper-catalog.json"), import("../content/paper-index.json"),
  ]);
  const metadata: Readonly<Record<string, PaperMetadata>> = { ...samplePapers, ...index };
  return catalog.map(entry => ({ id: entry.id, paper: structuredClone(metadata[entry.metadata]), collection: entry.collection as PaperCollection,
    filename: `${entry.slug}.pdf`, hash: "", importedAt: "2026-09-29T00:00:00.000Z", pages: 0,
    pdfUrl: assetUrl(`api/papers/${entry.slug}`), pdfRevision: entry.revision, cached: false }));
}
