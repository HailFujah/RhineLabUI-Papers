import content from "../content/archives.json" with { type: "json" };
import { samplePapers, type PaperMetadata } from "./paper-metadata.ts";
import type { StoredPaper } from "./paper-library";

export interface ArchiveRecord {
  id: string;
  title: string;
  en: string;
  department: string;
  category: string;
  date: string;
  lead: string;
  clearance: string;
  abstract: string;
  findings: string[];
  source: string;
  paper?: PaperMetadata;
  displayId?: string;
}

const originalRecords: ArchiveRecord[] = content.records.map(record => {
  const paper = samplePapers[record.id];
  return { ...record, paper };
});
export let records = originalRecords;
export let categories = ["全部档案", ...content.categories];
export let archiveColumns = [...content.columns];
export let libraryKind: "archives" | "papers" = "archives";
export const recordLabel = (record: ArchiveRecord) => record.displayId ?? record.id;
export const catalogGroup = (index: number) => archiveColumns.indexOf(records[index].category);

export function useArchiveLibrary() {
  libraryKind = "archives"; records = originalRecords;
  archiveColumns = [...content.columns]; categories = ["全部档案", ...content.categories];
}

export function usePaperLibrary(papers: StoredPaper[]) {
  if (!papers.length) return false;
  const groups = new Map<string, StoredPaper[]>();
  for (const item of papers) {
    const venue = item.paper.venue.trim().replace(/\s+/g, " ") || "未录入期刊";
    const key = [...groups.keys()].find(name => name.toLocaleLowerCase() === venue.toLocaleLowerCase()) ?? venue;
    const group = groups.get(key) ?? []; group.push(item); groups.set(key, group);
  }
  archiveColumns = [...groups.keys()].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const date = (paper: StoredPaper) => {
    if (!/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(paper.paper.published)) return "9999-99-99";
    const [year, month = "00", day = "00"] = paper.paper.published.split("-");
    return `${year}-${month}-${day}`;
  };
  records = archiveColumns.flatMap(venue => groups.get(venue)!
    .sort((a, b) => date(a).localeCompare(date(b)) || a.importedAt.localeCompare(b.importedAt) || a.id.localeCompare(b.id))
    .map((item, index): ArchiveRecord => ({ id: item.id, displayId: `X-${String(index + 1).padStart(3, "0")}`,
      paper: item.paper, title: item.paper.translatedTitle || item.paper.title, en: item.paper.title,
      department: item.paper.institutions.join(" / "), category: venue, date: item.paper.published,
      lead: item.paper.authors.join(", "), clearance: "PERSONAL LIBRARY", abstract: item.paper.abstract,
      findings: [], source: item.paper.url })));
  libraryKind = "papers"; categories = ["全部档案", ...archiveColumns];
  return true;
}

export function columnFiles(lane: number) {
  return records
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => record.category === archiveColumns[lane])
    .map(({ index }) => index);
}
export function fileLocation(index: number) {
  const group = catalogGroup(index);
  const ordinal = columnFiles(group).indexOf(index);
  const lane = libraryKind === "papers" ? ordinal : group;
  const row = 12 + (libraryKind === "papers" ? group : ordinal);
  // The legacy slot encoding is only meaningful for the fixed original grid.
  return { lane, row, slot: libraryKind === "papers" ? index : lane * 32 + row };
}
export function fileAtSlot(slot: number) {
  if (libraryKind === "papers") return Math.max(0, Math.min(records.length - 1, slot));
  const files = columnFiles(Math.floor(slot / 32));
  return files[Math.max(0, Math.min(files.length - 1, (slot % 32) - 12))];
}
