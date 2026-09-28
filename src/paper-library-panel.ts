import { escapeHtml as html } from "./html";
import { inspectPaper } from "./paper-import";
import { fileHash, storedPapers, storePaper, type StoredPaper } from "./paper-library";
import { paperUrl, type PaperMetadata } from "./paper-metadata";

const fields: { key: keyof PaperMetadata; label: string; multiline?: boolean }[] = [
  { key: "title", label: "论文原名" }, { key: "translatedTitle", label: "中文译名" },
  { key: "authors", label: "作者 · 每行一位", multiline: true },
  { key: "institutions", label: "机构 · 每行一家", multiline: true },
  { key: "published", label: "发表时间 · YYYY / YYYY-MM / YYYY-MM-DD" },
  { key: "venue", label: "期刊／会议 · 同名归入同一行" },
  { key: "fields", label: "研究领域 · 逗号分隔" }, { key: "keywords", label: "关键词 · 逗号分隔" },
  { key: "doi", label: "DOI" }, { key: "url", label: "论文页面 · https://…" },
  { key: "abstract", label: "摘要", multiline: true },
  { key: "references", label: "论文末尾参考文献 · 每行一条", multiline: true },
];

export class PaperLibraryPanel {
  private papers: StoredPaper[] = [];
  private draft?: StoredPaper;
  private job?: AbortController;
  private alive = true;
  private busy = false;
  constructor(private root: HTMLElement, private onOpen: (papers: StoredPaper[], id?: string) => void,
    private onOriginal: () => void) {
    root.innerHTML = `<h2>UPLOAD ARCHIVE<small>个人论文库</small></h2>
      <p class="paper-import-note">选择 PDF 后核对识别结果，再保存。每行一个期刊／会议，同一行从左到右按发表时间由早到晚排列。文件保存在本浏览器；原有档案独立保留。</p>
      <div class="paper-library-actions"><label class="paper-file-pick">选择 PDF <span>↑</span><input type="file" accept="application/pdf,.pdf" aria-label="选择论文 PDF"/></label><button type="button" data-library="browse">进入论文库 ↗</button><button type="button" data-library="original">原档案库 ↗</button></div>
      <p class="paper-import-status" role="status" aria-live="polite"></p>
      <form class="paper-edit-form" hidden>${fields.map(field => `<label class="${field.multiline ? "paper-field-wide" : ""}"><span>${field.label}</span>${field.multiline ? `<textarea name="${field.key}" rows="${field.key === "references" ? 6 : 3}"></textarea>` : `<input name="${field.key}" ${field.key === "title" ? "required" : ""} ${field.key === "url" ? 'type="url"' : 'type="text"'}/>`}</label>`).join("")}
      <p class="paper-field-wide paper-import-note">无法识别的字段留空，译名请手动填写。未录入期刊的论文单独归组，缺少日期的论文排在该组末尾。扫描版 PDF 需要手动录入。</p><div class="paper-field-wide paper-library-actions"><button type="submit">保存并打开论文 ↗</button><button type="button" data-library="cancel">取消编辑</button></div></form>
      <div class="paper-library-list"></div>`;
    root.querySelector<HTMLInputElement>('input[type="file"]')!.addEventListener("change", event => {
      const input = event.target as HTMLInputElement, file = input.files?.[0];
      input.value = ""; if (file) void this.import(file);
    });
    root.querySelector("form")!.addEventListener("submit", event => { event.preventDefault(); void this.save(); });
    root.addEventListener("click", event => {
      const button = (event.target as Element).closest<HTMLButtonElement>("button");
      if (!button || this.busy) return;
      if (button.dataset.library === "original") this.onOriginal();
      if (button.dataset.library === "browse" && this.papers.length) this.onOpen(this.papers);
      if (button.dataset.library === "cancel") { this.draft = undefined; this.form.hidden = true; this.status(""); }
      const id = button.dataset.paper;
      if (id) {
        const paper = this.papers.find(p => p.id === id);
        if (!paper) return;
        if (button.dataset.edit === "true") this.edit(paper); else this.onOpen(this.papers, id);
      }
    });
    void this.load();
  }
  private get form() { return this.root.querySelector<HTMLFormElement>("form")!; }
  private status(message: string) { if (this.alive) this.root.querySelector(".paper-import-status")!.textContent = message; }
  private setBusy(busy: boolean) {
    this.busy = busy;
    this.root.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLTextAreaElement>("input,button,textarea").forEach(el => el.disabled = busy);
    if (!busy) this.root.querySelector<HTMLButtonElement>('[data-library="browse"]')!.disabled = !this.papers.length;
  }
  private async load() {
    try { this.papers = await storedPapers(); if (this.alive) this.list(); }
    catch { this.status("无法打开本地论文库，请检查浏览器存储权限后重新打开此窗口。"); }
  }
  private list() {
    this.root.querySelector(".paper-library-list")!.innerHTML = `<div class="panel-label">PAPER LIBRARY / ${this.papers.length} 篇</div>${this.papers.length ? this.papers.map(p => `<div class="paper-library-item"><button type="button" data-paper="${html(p.id)}"><strong>${html(p.paper.title)}</strong><small>${html(p.paper.venue || "未录入期刊")} · ${html(p.paper.published || "日期未录入")}</small></button><button type="button" data-paper="${html(p.id)}" data-edit="true">编辑信息</button></div>`).join("") : '<p class="paper-import-note">还没有导入论文。</p>'}`;
    this.root.querySelector<HTMLButtonElement>('[data-library="browse"]')!.disabled = this.busy || !this.papers.length;
  }
  private edit(item: StoredPaper) {
    this.draft = item;
    for (const field of fields) {
      const value = item.paper[field.key];
      (this.form.elements.namedItem(field.key) as HTMLInputElement).value = Array.isArray(value) ? value.join(field.multiline ? "\n" : ", ") : value ?? "";
    }
    this.form.hidden = false;
    this.status(`${item.filename} · ${item.pages} 页 · 请核对论文信息`);
    this.form.querySelector<HTMLInputElement>("input")!.focus();
  }
  private async import(file: File) {
    if (this.busy) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") { this.status("请选择 PDF 文件。"); return; }
    this.job?.abort(); const job = this.job = new AbortController();
    this.setBusy(true); this.status("正在读取 PDF…");
    try {
      const hash = await fileHash(file);
      if (!this.alive || job.signal.aborted) return;
      // Read again so another tab's imports participate in duplicate detection.
      this.papers = await storedPapers();
      if (!this.alive || job.signal.aborted) return;
      const existing = this.papers.find(p => p.hash === hash);
      if (existing) { this.edit(existing); this.status("这份 PDF 已在论文库中，可修改信息后重新打开。"); return; }
      const result = await inspectPaper(new Uint8Array(await file.arrayBuffer()), file.name, job.signal,
        (page, pages) => this.status(`正在识别论文文字与参考文献 · ${page} / ${pages}`));
      if (!this.alive || job.signal.aborted) return;
      this.edit({ id: `paper:${crypto.randomUUID()}`, paper: result.paper, file, filename: file.name, hash,
        importedAt: new Date().toISOString(), pages: result.pages });
    } catch (error) { if (!job.signal.aborted) this.status(`无法读取 PDF：${error instanceof Error ? error.message : "文件不可用"}`); }
    finally { if (this.alive) { this.setBusy(false); if (this.draft) this.form.querySelector<HTMLInputElement>("input")!.focus(); } }
  }
  private async save() {
    if (!this.draft || this.busy || !this.form.reportValidity()) return;
    const value = (name: string) => (this.form.elements.namedItem(name) as HTMLInputElement).value.trim();
    if (!value("title")) { this.status("请填写论文原名。"); return; }
    const published = value("published");
    if (published && !/^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/.test(published)) {
      this.status("发表时间请使用 YYYY、YYYY-MM 或 YYYY-MM-DD 格式。"); return;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(published) && new Date(`${published}T00:00:00Z`).toISOString().slice(0, 10) !== published) {
      this.status("该日期不存在，请检查发表时间。"); return;
    }
    if (value("url") && !paperUrl(value("url"))) { this.status("论文页面请使用 http 或 https 链接。"); return; }
    const split = (name: string, pattern = /\r?\n/) => value(name).split(pattern).map(v => v.trim()).filter(Boolean);
    const paper: PaperMetadata = { ...this.draft.paper, title: value("title"), translatedTitle: value("translatedTitle"),
      authors: split("authors"), institutions: split("institutions"), published, venue: value("venue"),
      fields: split("fields", /[,，;；]/), keywords: split("keywords", /[,，;；]/), doi: value("doi"),
      url: paperUrl(value("url") || (value("doi") ? `https://doi.org/${value("doi")}` : "")),
      abstract: value("abstract"), references: split("references") };
    this.setBusy(true); this.status("正在保存论文…");
    try {
      const item = { ...this.draft, paper }; await storePaper(item);
      const papers = await storedPapers();
      if (this.alive) { this.papers = papers; this.list(); this.onOpen(papers, item.id); }
    } catch { this.status("保存失败，可能是浏览器存储空间或权限不足。已识别的信息保留在此处，请稍后重试。"); }
    finally { if (this.alive) this.setBusy(false); }
  }
  dispose() { this.alive = false; this.job?.abort(); }
}
