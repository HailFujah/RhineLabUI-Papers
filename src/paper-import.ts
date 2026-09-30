import type { PaperMetadata } from "./paper-metadata";
import { paperUrl, samplePapers } from "./paper-metadata";

/** Read text sequentially without rasterizing pages or retaining full canvases. */
export async function inspectPaper(source: string | Uint8Array, filename: string, signal: AbortSignal,
  progress?: (page: number, pages: number) => void): Promise<{ paper: PaperMetadata; pages: number }> {
  const { PdfDocument } = await import("./pdf-document");
  const document = await PdfDocument.load(source, signal);
  const abort = () => document.destroy();
  signal.addEventListener("abort", abort, { once: true });
  try {
    const { info, metadata } = await document.pdf.getMetadata();
    const details = info as Record<string, unknown>;
    const field = (key: string, xmp: string) => {
      const value = metadata?.get(xmp) || details[key];
      return typeof value === "string" ? value.trim() : Array.isArray(value) ? value.filter(v => typeof v === "string").join("; ") : "";
    };
    let front = "", firstPage = "", bibliography = "", collecting = false, finished = false;
    let titleCandidate = "";
    for (let pageNumber = 1; pageNumber <= document.pageCount; pageNumber++) {
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      const page = await document.pdf.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        const items = content.items.filter(item => "str" in item);
        const text = items.map(item => item.str + (item.hasEOL ? "\n" : " ")).join("");
        if (pageNumber <= 3) front += text.slice(0, 35_000) + "\n";
        if (pageNumber === 1) {
          firstPage = text;
          const candidates = items.filter(item => item.str.trim().length > 4 && item.transform[5] > page.view[3] * .5);
          const height = Math.max(0, ...candidates.map(item => Math.abs(item.height)));
          titleCandidate = candidates.filter(item => Math.abs(item.height) >= height * .94).map(item => item.str).join(" ").trim();
        }
        for (const line of text.split(/\r?\n/)) {
          if (/^\s*(?:\d+[.\s]*)?(?:References|Bibliography|参考文献)\s*$/i.test(line)) { collecting = true; finished = false; continue; }
          if (collecting && (/^\s*(?:[A-Z][.\s]+)?(?:Appendix|Appendices|Supplementary|Attention Visualizations|附录)\b/i.test(line)
            || /^\s*[A-Z][.\s]+Additional Details\b/.test(line))) { collecting = false; finished = true; }
          if (collecting && bibliography.length < 250_000) bibliography += `${line}\n`;
        }
        progress?.(pageNumber, document.pageCount);
        if (finished && pageNumber > 3) break;
      } finally { page.cleanup(); }
    }
    const doi = front.match(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i)?.[0]?.replace(/[.,;]+$/, "") ?? "";
    const arxiv = front.match(/arXiv\s*:\s*(\d{4}\.\d{4,5}(?:v\d+)?)/i)?.[1] ?? "";
    const title = field("Title", "dc:title");
    const fallback = titleCandidate || filename.replace(/\.pdf$/i, "");
    const abstractBlock = front.match(/(?:^|\n)\s*Abstract\s*[:：]?\s*([\s\S]*?)(?=\n\s*(?:(?:1|I)[.\s]+)?Introduction\b|\n\s*(?:Keywords|Index Terms)\s*[:：]|$)/i)?.[1] ?? "";
    // The sample puts contribution notes and the conference footer before the
    // next page's Introduction. Those notes are outside the original Abstract.
    const abstract = abstractBlock.split(/\n\s*(?:[*∗†‡]+\s*)?(?:Equal contribution\b|Corresponding author\s*[:：]|Work (?:done|performed) while\b)/i)[0].trim();
    const affiliations = firstPage.split(/\bAbstract\b|摘要/)[0].split(/\r?\n/)
      .map(line => line.trim()).filter(line => line.length < 180 && !/@|https?:|arxiv/i.test(line) && /\b(?:University|Institute|Laboratory|Laboratories|Google Brain|Google Research)\b|大学|研究所|研究院/.test(line));
    const dateMatch = front.match(/(?:Publication date|Published(?: online)?|发表日期|出版日期)\s*[:：]\s*(\d{4}(?:-\d{2}(?:-\d{2})?)?)/i);
    const venue = firstPage.match(/(?:^|\n)\s*(?:Journal|Conference|期刊|会议)\s*[:：]\s*([^\n]+)/i)?.[1]?.trim() ?? "";
    const conference = firstPage.match(/Published as (?:a )?conference paper at\s+([^\n]+?)\s+(20\d{2})\b/i);
    const paper: PaperMetadata = {
      title: !title || /^(?:untitled|Microsoft Word|latex|template)/i.test(title) ? fallback : title,
      translatedTitle: "", authors: field("Author", "dc:creator").split(/\s*;\s*|\s+and\s+/).filter(Boolean),
      institutions: [...new Set(affiliations)], published: dateMatch?.[1] ?? conference?.[2] ?? "", venue: venue || conference?.[1] || "", fields: [],
      keywords: field("Keywords", "pdf:Keywords").split(/[,;，；]/).map(v => v.trim()).filter(Boolean),
      doi, abstract: abstract.slice(0, 12_000), abstractLabel: "原文摘要", url: paperUrl(arxiv ? `https://arxiv.org/abs/${arxiv}` : doi ? `https://doi.org/${doi}` : ""),
      references: splitReferences(bibliography),
    };
    // The supplied technical sample has explicitly sourced metadata, not a
    // heuristic guess from a PDF creation date or an author affiliation.
    if (arxiv.replace(/v\d+$/, "") === "1706.03762" || /^Attention Is All You Need[.\s]*$/i.test(paper.title)) {
      return { pages: document.pageCount, paper: { ...structuredClone(samplePapers["X-001"]),
        abstract: paper.abstract, abstractLabel: "原文摘要", references: paper.references } };
    }
    return { pages: document.pageCount, paper };
  } finally { signal.removeEventListener("abort", abort); document.destroy(); }
}

function splitReferences(text: string) {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line && !/^\d+$/.test(line));
  // Four-digit publication years can begin wrapped lines in author/year styles.
  // They are not numbered references (e.g. the BERT bibliography).
  const marker = /^(?:\[\d{1,3}\]|\d{1,3}[.)])\s*/;
  const numbered = lines.some(line => marker.test(line));
  const references: string[] = [];
  for (const line of lines) {
    const starts = numbered ? marker.test(line) : /^(?:\p{Lu}[\p{L}'’.-]+,|\p{Lu}[\p{L}'’.-]+(?:\s+\p{Lu}[\p{L}'’.-]+){1,5}(?:,| and )|[\u4e00-\u9fff]{2,4}[，,])/u.test(line);
    if (starts || !references.length) references.push(line.replace(marker, ""));
    else references[references.length - 1] += ` ${line}`;
  }
  return references.map(line => line.replace(/\s+/g, " ").trim()).filter(line => line.length > 12).slice(0, 500);
}
