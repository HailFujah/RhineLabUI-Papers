/** Editorial library rows are independent of a paper's scholarly venue. */
export const paperCollections = [
  { id: "classic", label: "代表论文" },
  { id: "conference", label: "ACL／ICML 会议论文" },
  { id: "recent", label: "近期 arXiv 论文" },
] as const;
export type PaperCollection = typeof paperCollections[number]["id"];
export function paperCollectionLabel(collection?: PaperCollection) {
  return paperCollections.find(item => item.id === collection)?.label ?? "个人导入";
}
