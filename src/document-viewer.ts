import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createArchiveLighting } from "./archive-lighting";
import { groupArchiveParts, spreadArchiveParts, type ArchiveDocumentPose, type ArchiveModelSource } from "./archive-assembly";
import { ViewerCameraMotion } from "./viewer-camera";
import { applyTextureQuality, resizeQuality } from "./quality-renderer";
import { normalizeQuality, type RenderQuality } from "./render-quality";
import { fullMotion, type MotionPreferences } from "./motion-preferences";
import { themeEnvironment } from "./theme-material";
import { damp, smooth } from "./motion";
import { PdfSliceFactory, type PdfSlice } from "./pdf-slice";
import { pdfSlicePosition, pdfWindow } from "./pdf-layout";
import { pdfPageMaterial } from "./pdf-material";
import { brandHeading } from "./brand";
import type { ArchiveDocument } from "./archive-documents";
import type { PdfDocument, PdfRaster } from "./pdf-document";
import "./document-viewer.css";

type State = "CLOSED" | "LOADING" | "EXPLODING" | "PROJECTING" | "ENTERING" | "PDF_OVERVIEW" | "SELECTING" | "PDF_READING" | "RETURNING_PAGE" | "RETRACTING" | "REASSEMBLING" | "RETURNING_ARCHIVE" | "ERROR";
type Thumbnail = { raster: PdfRaster; texture: THREE.CanvasTexture };
const pad = (n: number) => String(n).padStart(2, "0");
const release = (raster?: PdfRaster) => { if (raster) raster.canvas.width = raster.canvas.height = 1; };
const cancellation = (error: unknown) => error instanceof Error && ["AbortError", "RenderingCancelledException"].includes(error.name);
const readerStates = new Set<State>(["PDF_OVERVIEW", "SELECTING", "PDF_READING", "RETURNING_PAGE"]);
const closingStates = new Set<State>(["RETRACTING", "REASSEMBLING", "RETURNING_ARCHIVE"]);

// The archive is centered at the origin. Describe its framing independently
// of the very different lens distances used by the detail and PDF scenes.
const archiveFraming = (camera: THREE.PerspectiveCamera) => {
  const center = camera.position.clone().negate().applyQuaternion(camera.quaternion.clone().invert());
  const halfHeight = -center.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / camera.zoom;
  return { x: center.x / halfHeight, y: center.y / halfHeight, halfHeight };
};

/** Detail -> physical disassembly -> optical projection -> slice archive.
 * A single renderer and explicit state own all transitions and asynchronous work. */
export class DocumentViewer {
  readonly root = document.createElement("section");
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(34, 16 / 9, .1, 300);
  private projectionCamera = new THREE.PerspectiveCamera(34, 16 / 9, .1, 300);
  private substrateCamera = new THREE.PerspectiveCamera(34, 16 / 9, .1, 300);
  private readClip = [new THREE.Plane(), new THREE.Plane(), new THREE.Plane(), new THREE.Plane()];
  private identity = new THREE.Quaternion();
  private origin = new THREE.Vector3();
  private readingCameraPosition = new THREE.Vector3(0, 0, 17);
  private renderer: THREE.WebGLRenderer;
  private state: State = "CLOSED";
  private quality = normalizeQuality(undefined);
  private motion = fullMotion();
  private superPerformance = false;
  private theme = 0;
  private source?: ArchiveModelSource;
  private sourcePivot = new THREE.Group();
  private parts = new Map<string, THREE.Group>();
  private factory?: PdfSliceFactory;
  private slices = new Map<number, PdfSlice>();
  private thumbnails = new Map<number, Thumbnail>();
  private thumbJobs = new Map<number, AbortController>();
  private thumbBusy = 0;
  private thumbFailures = new Set<number>();
  private stack = new THREE.Group();
  private reading?: PdfSlice;
  private hd?: Thumbnail;
  private hdJob?: AbortController;
  private hdTimer?: ReturnType<typeof setTimeout>;
  private hdPage = 0;
  private hdWidth = 0;
  private pdf?: PdfDocument;
  private loadJob?: AbortController;
  private generation = 0;
  private attachment?: ArchiveDocument;
  private provider?: () => Promise<ArchiveModelSource>;
  private pose?: ArchiveDocumentPose;
  private archiveReturn?: { camera: THREE.PerspectiveCamera; rotation: THREE.Quaternion; intro: number };
  private page = 1;
  private hover: number | null = null;
  private displayedPage = 0;
  private pendingPage: number | null = null;
  private intro = 0;
  private spread = { value: 0, velocity: 0 };
  private extraction = { value: 0, velocity: 0 };
  private lastTime = 0;
  private wheel = 0;
  private opener: HTMLElement | null = null;
  private siblings: { node: HTMLElement; inert: boolean }[] = [];
  private controlCamera = new THREE.PerspectiveCamera(34, 1, .1, 100);
  private orbitCamera = this.controlCamera.clone();
  private cameraMotion = new ViewerCameraMotion(this.orbitCamera);
  private controls: OrbitControls;
  private projection = new THREE.Group();
  private projectionPage?: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private projectionDark?: { value: number };
  private sourceMaterials = new Map<THREE.Material, { opacity: number; transparent: boolean; depthWrite: boolean; opticalCover: boolean }>();
  private raycaster = new THREE.Raycaster();
  private navHit: HTMLElement;
  private readHit: HTMLElement;
  private navPosition = new THREE.Vector3();
  private readPosition = new THREE.Vector3();
  private readScale = 1;
  private navScale = 1;
  private navQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(-.10, .42, -.04));
  private statsTime = 0;
  private resizeObserver: ResizeObserver;
  get isOpen() { return this.state !== "CLOSED"; }
  private get browsing() { return readerStates.has(this.state); }

  constructor(parent: HTMLElement, private onClose: () => void, private sound: (sound: "explode" | "assemble" | "tick") => void,
    private onRead?: (page: number, pages: number) => void) {
    this.root.className = "document-viewer";
    this.root.hidden = true;
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "true");
    this.root.setAttribute("aria-labelledby", "document-title");
    this.root.innerHTML = `
      <div class="document-canvas" aria-hidden="true"></div>
      <div class="document-wash" aria-hidden="true"></div>
      <header class="document-header">
        <button data-document="close" class="document-back">← <span>返回档案</span> <kbd>ESC</kbd></button>
        <div class="document-brand">${brandHeading}</div>
        <div class="document-heading"><div class="document-eyebrow">RHINE LAB / DOCUMENT STUDY</div><h2 id="document-title"></h2><p class="document-file"></p></div>
        <label class="document-import">载入 PDF ↗<input type="file" accept="application/pdf,.pdf" aria-label="选择本地 PDF 文件"></label>
      </header>
      <div class="document-division" aria-hidden="true"><i></i></div>
      <div class="document-stage-label" aria-live="polite"></div>
      <section class="document-navigation" aria-label="PDF 切片导航">
        <div class="document-panel-heading"><span>01 / SLICE ARCHIVE</span><span class="document-count"></span></div>
        <div class="document-nav-hit" tabindex="0" role="group" aria-label="页面切片：左右键定位，Enter 抽出阅读，滚轮浏览"></div>
        <div class="document-nav-footer">
          <div class="document-hover">PAGE 01</div><div class="document-pages" role="group" aria-label="可见页面"></div>
          <input class="document-range" type="range" min="1" max="1" value="1" aria-label="滚动定位 PDF 页面">
          <div class="document-range-label"><span class="document-window"></span><label>跳至 <input class="document-jump" type="number" min="1" value="1" aria-label="跳转页码"> 页 <button data-document="jump" aria-label="确认跳转页码">↗</button></label></div>
        </div>
      </section>
      <section class="document-reading" aria-label="三维 PDF 阅读页">
        <div class="document-panel-heading"><span>OPTICAL PROJECTION / 正面限角</span><span class="document-resolution"></span></div>
        <div class="document-read-hit" tabindex="0" role="group" aria-label="三维阅读页：左键拖动有限倾转，滚轮缩放，右键拖动平移，双指缩放平移，Home 复位"></div>
        <div class="document-empty"><span>SELECT A SLICE</span><p>从左侧抽出一页</p><small>悬停提起 · 点击阅读</small></div>
        <footer class="document-reader-hud">
          <div><button data-document="overview">↙ 返回堆叠</button><span class="document-page-status" aria-live="polite"></span><button data-document="prev" aria-label="上一页">←</button><button data-document="next" aria-label="下一页">→</button></div>
          <div><button data-document="zoom-out" aria-label="缩小">−</button><output class="document-zoom">100%</output><button data-document="zoom-in" aria-label="放大">＋</button><button data-document="fit">适宽</button><button data-document="reset">复位视角 ↗</button></div>
        </footer>
      </section>
      <div class="document-message" role="status"><span></span><button data-document="retry" hidden>重新载入 ↗</button></div>
      <footer class="document-foot"><span class="document-instruction">REFRACTIVE RINGS → OPTICAL CORE → SUBSTRATE</span><span>POWERED BY <b>RHINE LAB</b> ━</span></footer>`;
    parent.append(this.root);
    this.navHit = this.el(".document-nav-hit");
    this.readHit = this.el(".document-read-hit");
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.localClippingEnabled = true;
    this.el(".document-canvas").append(this.renderer.domElement);
    this.scene.background = new THREE.Color("#eae5e1");
    createArchiveLighting(this.renderer, this.scene);
    this.scene.add(this.sourcePivot, this.stack, this.projection);
    this.projectionCamera.position.set(7.2, 3.8, 12);
    this.projectionCamera.lookAt(0, 0, 0);
    this.substrateCamera.position.set(1.2, .6, 8);
    this.substrateCamera.lookAt(0, 0, -1.1);
    this.controls = new OrbitControls(this.controlCamera, this.readHit);
    this.controls.enableDamping = false;
    this.controls.rotateSpeed = .65; this.controls.zoomSpeed = .7; this.controls.panSpeed = .7;
    this.controls.minDistance = 3; this.controls.maxDistance = 22; this.controls.maxTargetRadius = 4;
    // The page face stays dominant: 16° yaw and 10° pitch in either direction.
    this.controls.minAzimuthAngle = -.28; this.controls.maxAzimuthAngle = .28;
    this.controls.minPolarAngle = Math.PI / 2 - .18; this.controls.maxPolarAngle = Math.PI / 2 + .18;
    this.controls.touches.ONE = THREE.TOUCH.ROTATE; this.controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    this.controls.addEventListener("start", () => this.cameraMotion.interruptReset(this.controlCamera, this.controls.target));
    this.controls.addEventListener("end", () => this.scheduleHD());
    this.readHit.addEventListener("pointerdown", event => {
      // OrbitControls reduces pan with camera distance, but this reader moves
      // a separate page mesh. Compensate zoom so mouse dragging stays responsive.
      this.controls.panSpeed = .7 * (event.pointerType === "touch" ? 1 : Math.max(1, this.zoom()));
    }, { capture: true });
    this.resetView(false);
    this.root.addEventListener("click", event => this.click(event));
    this.root.addEventListener("keydown", event => this.keydown(event));
    this.root.querySelector<HTMLInputElement>('input[type="file"]')!.addEventListener("change", event => {
      const input = event.target as HTMLInputElement, file = input.files?.[0];
      input.value = "";
      if (!file || closingStates.has(this.state)) return;
      const generation = this.generation;
      void file.arrayBuffer().then(bytes => {
        if (!this.isOpen || generation !== this.generation) return;
        this.attachment = { title: file.name, url: "" };
        this.el("#document-title").textContent = file.name;
        this.el(".document-file").textContent = "LOCAL DOCUMENT / 仅在此设备读取";
        void this.load(new Uint8Array(bytes));
      }).catch(() => this.message("无法读取该文件，请重新选择。", false));
    });
    this.el<HTMLInputElement>(".document-range").addEventListener("input", event => this.locate(Number((event.target as HTMLInputElement).value)));
    this.el<HTMLInputElement>(".document-jump").addEventListener("change", () => this.jump());
    this.navHit.addEventListener("pointermove", event => this.pick(event));
    this.navHit.addEventListener("pointerleave", () => { this.hover = null; this.refreshHover(); });
    let pointerStart = { x: 0, y: 0 };
    this.navHit.addEventListener("pointerdown", event => { pointerStart = { x: event.clientX, y: event.clientY }; this.pick(event); });
    this.navHit.addEventListener("pointerup", event => {
      const delta = event.clientX - pointerStart.x;
      if (Math.abs(delta) > 30) this.locate(this.page + (delta < 0 ? 1 : -1));
      else if (Math.hypot(delta, event.clientY - pointerStart.y) < 12 && this.hover) this.select(this.hover);
    });
    this.navHit.addEventListener("wheel", event => {
      if (!this.browsing) return;
      event.preventDefault();
      this.wheel += (event.deltaY || event.deltaX) * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 300 : 1);
      if (Math.abs(this.wheel) >= 45) { this.locate(this.page + Math.sign(this.wheel)); this.wheel = 0; }
    }, { passive: false });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.root);
  }
  private el<T extends HTMLElement = HTMLElement>(selector: string) { return this.root.querySelector<T>(selector)!; }
  private setState(state: State) {
    if (state === "PDF_READING" && this.state !== state && this.pdf && this.attachment?.url) this.onRead?.(this.displayedPage, this.pdf.pageCount);
    this.state = state; this.root.dataset.state = state;
    const ready = readerStates.has(state);
    this.el(".document-navigation").inert = !ready;
    this.el(".document-reading").inert = !ready;
    this.controls.enabled = state === "PDF_READING" || state === "SELECTING";
    const phases: Partial<Record<State, string>> = { LOADING: "PREPARING / 载入档案内容", EXPLODING: "01 / 拆解档案", PROJECTING: "02 / 光学核心投影 · 切片显影", ENTERING: "03 / 从信息基板抽出光学切片", RETRACTING: "RETURN / 光学切片归入信息基板", REASSEMBLING: "REASSEMBLING / 一键重组档案", RETURNING_ARCHIVE: "ARCHIVE / 返回档案预览" };
    this.el(".document-stage-label").textContent = phases[state] ?? "";
    this.el(".document-instruction").textContent = ready ? "滚轮浏览切片 / 左键倾转 · 右键平移 · 双指缩放平移" : "REFRACTIVE RINGS → OPTICAL CORE → SUBSTRATE";
  }
  setTheme(theme: number) { this.theme = theme; }
  setMotion(motion: MotionPreferences) { this.motion = { ...motion }; }
  setQuality(quality: RenderQuality) {
    this.quality = normalizeQuality(quality);
    applyTextureQuality(this.scene, this.renderer, quality);
    this.resize();
  }
  setSuperPerformance(value: boolean) { this.superPerformance = value; this.resize(); }
  open(id: string, title: string, attachment: ArchiveDocument | undefined, provider: () => Promise<ArchiveModelSource>, pose: ArchiveDocumentPose) {
    if (this.isOpen) return;
    this.attachment = attachment; this.provider = provider; this.pose = pose;
    this.opener = document.activeElement as HTMLElement | null;
    this.siblings = [...this.root.parentElement!.children].filter((n): n is HTMLElement => n instanceof HTMLElement && n !== this.root).map(node => ({ node, inert: node.inert }));
    this.siblings.forEach(({ node }) => node.inert = true);
    this.root.hidden = false;
    this.root.parentElement!.dataset.documentActive = "true";
    this.intro = 0; this.lastTime = 0; this.spread = { value: 0, velocity: 0 };
    this.archiveReturn = undefined;
    this.el("#document-title").textContent = attachment?.title ?? title;
    this.el(".document-file").textContent = `FILE ${id} / ${attachment?.sample ? "技术样例 · arXiv:1706.03762" : "DOCUMENT ARCHIVE"}`;
    this.el(".document-back").focus({ preventScroll: true });
    this.setState("LOADING"); this.resize();
    void this.load(attachment?.url);
  }

  private async load(input?: string | Uint8Array) {
    const preserveIntro = this.browsing || this.intro === 1;
    this.clearDocument();
    const generation = ++this.generation;
    const job = this.loadJob = new AbortController();
    this.setState("LOADING");
    this.el(".document-back").focus({ preventScroll: true });
    this.message(input ? "正在解析 PDF 页面…" : "选择本地 PDF，展开档案中的页面。", false);
    try {
      if (!this.source) {
        const source = await this.provider!();
        if (job.signal.aborted || generation !== this.generation) { source.dispose(); return; }
        this.source = source; source.setClarity?.(1);
        source.model.traverse(object => {
          if (object instanceof THREE.Mesh) for (const material of [object.material].flat())
            this.sourceMaterials.set(material, { opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite, opticalCover: object.userData.surface === "Frosted_Polymer" });
        });
        this.factory = new PdfSliceFactory(source.model);
        this.parts = groupArchiveParts(source.model);
        source.model.position.y = -1.85;
        this.sourcePivot.add(source.model);
        this.buildProjection();
        applyTextureQuality(source.model, this.renderer, this.quality);
      }
      if (!input) return;
      const { PdfDocument } = await import("./pdf-document");
      if (job.signal.aborted) return;
      const pdf = await PdfDocument.load(input, job.signal);
      if (job.signal.aborted || generation !== this.generation) { pdf.destroy(); return; }
      this.pdf = pdf; this.page = 1; this.hover = null;
      const raster = await pdf.raster(1, 340, 190_000, 1024, job.signal);
      if (job.signal.aborted || generation !== this.generation) { release(raster); return; }
      this.thumbnails.set(1, { raster, texture: this.texture(raster) });
      this.projectionPage!.material.map = this.thumbnails.get(1)!.texture;
      this.projectionPage!.material.needsUpdate = true;
      this.projectionPage!.scale.set(2.8 * raster.width / raster.height, 2.8, 1);
      this.el<HTMLInputElement>(".document-range").max = String(pdf.pageCount);
      this.el<HTMLInputElement>(".document-jump").max = String(pdf.pageCount);
      this.el(".document-count").textContent = `${pad(pdf.pageCount)} PAGES`;
      this.ensureWindow(); this.refreshHUD(); this.message("");
      if (preserveIntro || !this.motion.viewerModelTransition) { this.intro = 1; this.setState("PDF_OVERVIEW"); this.navHit.focus({ preventScroll: true }); }
      else { this.intro = 0; this.setState("EXPLODING"); this.sound("explode"); }
    } catch (error) {
      if (job.signal.aborted || generation !== this.generation || cancellation(error)) return;
      this.setState("ERROR");
      const name = error instanceof Error ? error.name : "";
      this.message(name === "PasswordException" ? "此 PDF 需要密码。请载入已解锁的副本。" : "PDF 载入失败。可以重试，或选择本地 PDF 文件。", Boolean(this.attachment?.url));
      console.warn("Document projection load failed", error);
    }
  }
  private texture(raster: PdfRaster) {
    const texture = new THREE.CanvasTexture(raster.canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(this.quality.anisotropy, this.renderer.capabilities.getMaxAnisotropy());
    texture.generateMipmaps = true;
    return texture;
  }
  private ensureWindow() {
    if (!this.pdf || !this.factory) return;
    const pages = pdfWindow(this.page, this.pdf.pageCount);
    const keep = new Set(pages);
    for (const [page, slice] of this.slices) if (!keep.has(page)) { slice.dispose(); this.slices.delete(page); }
    for (const page of pages) if (!this.slices.has(page)) {
      const slice = this.factory.create(page), raster = this.thumbnails.get(page);
      if (raster) slice.setTexture(raster.texture, raster.raster.width / raster.raster.height);
      slice.root.visible = Boolean(raster);
      this.slices.set(page, slice); this.stack.add(slice.root);
      const position = pdfSlicePosition(pages.indexOf(page), pages.length);
      slice.root.position.set(position.x, position.y, position.z);
    }
    // Never retain a full-document thumbnail cache. Current/first textures also
    // serve the extracted page and projection, so exclude them from eviction.
    const cache = new Set(pdfWindow(this.page, this.pdf.pageCount, 13));
    cache.add(1); cache.add(this.displayedPage);
    for (const [page, thumbnail] of this.thumbnails) if (!cache.has(page)) {
      thumbnail.texture.dispose(); release(thumbnail.raster); this.thumbnails.delete(page);
    }
    for (const [page, job] of this.thumbJobs) if (!keep.has(page)) job.abort();
    this.pumpThumbnails();
    this.el(".document-pages").innerHTML = pages.map(page => `<button data-page="${page}" aria-label="阅读第 ${page} 页" aria-current="${page === this.page ? "page" : "false"}">${pad(page)}</button>`).join("");
    this.el(".document-window").textContent = `${pad(pages[0])} — ${pad(pages.at(-1)!)} / ${pad(this.pdf.pageCount)}`;
  }
  private pumpThumbnails() {
    if (!this.pdf || !this.isOpen || closingStates.has(this.state)) return;
    const pdf = this.pdf, generation = this.generation;
    const pending = pdfWindow(this.page, pdf.pageCount).sort((a, b) => Math.abs(a - this.page) - Math.abs(b - this.page));
    for (const page of pending) {
      if (this.thumbBusy >= 2) break;
      if (this.thumbnails.has(page) || this.thumbJobs.has(page) || this.thumbFailures.has(page)) continue;
      const job = new AbortController(); this.thumbJobs.set(page, job); this.thumbBusy++;
      void pdf.raster(page, 340, 190_000, 1024, job.signal).then(raster => {
        if (job.signal.aborted || generation !== this.generation) { release(raster); return; }
        const texture = this.texture(raster);
        this.thumbnails.set(page, { raster, texture });
        const slice = this.slices.get(page);
        if (slice) { slice.setTexture(texture, raster.width / raster.height); slice.root.visible = true; }
        if (this.displayedPage === page && this.hdPage !== page) this.reading?.setTexture(texture, raster.width / raster.height);
      }).catch(error => {
        if (generation !== this.generation || job.signal.aborted || cancellation(error)) return;
        this.thumbFailures.add(page);
        this.message(`第 ${page} 页缩略图无法生成；可以直接选择页码重试阅读。`);
      }).finally(() => {
        if (generation !== this.generation) return;
        this.thumbBusy--; this.thumbJobs.delete(page); this.pumpThumbnails();
      });
    }
  }
  private locate(page: number) {
    if (!this.pdf || !this.browsing || !Number.isFinite(page)) return;
    this.page = Math.max(1, Math.min(this.pdf.pageCount, Math.round(page)));
    const restoreNavFocus = Boolean((document.activeElement as HTMLElement)?.dataset.page);
    this.hover = null; this.ensureWindow(); this.refreshHUD();
    if (restoreNavFocus) this.navHit.focus({ preventScroll: true });
  }
  private select(page: number) {
    if (!this.pdf || !this.browsing || !this.factory) return;
    this.locate(page);
    const changed = this.displayedPage !== this.page;
    if (changed && this.reading && this.extraction.value > .01 && this.motion.viewerNavigation) {
      this.pendingPage = this.page;
      this.hdJob?.abort(); clearTimeout(this.hdTimer);
      this.setState("RETURNING_PAGE");
      return;
    }
    this.pendingPage = null;
    this.displayedPage = this.page;
    if (!this.reading) { this.reading = this.factory.create(this.page); this.scene.add(this.reading.root); }
    this.reading.setPage(this.page);
    if (changed) {
      this.hdJob?.abort(); clearTimeout(this.hdTimer);
      this.reading.setTexture(null);
      this.hd?.texture.dispose(); release(this.hd?.raster); this.hd = undefined; this.hdPage = 0; this.hdWidth = 0;
      const thumbnail = this.thumbnails.get(this.page);
      if (thumbnail) this.reading.setTexture(thumbnail.texture, thumbnail.raster.width / thumbnail.raster.height);
      this.extraction.value = Math.min(this.extraction.value, .12);
      this.extraction.velocity = 0;
      this.resetView(false);
    }
    this.setState("SELECTING"); this.refreshHUD(); this.message("");
    this.measureLayout();
    this.readHit.focus({ preventScroll: true });
    this.sound("tick"); this.scheduleHD(0);
  }
  private overview() {
    if (!this.browsing) return;
    this.hdJob?.abort(); clearTimeout(this.hdTimer);
    this.pendingPage = null;
    this.locate(this.displayedPage || this.page);
    this.setState("RETURNING_PAGE");
    this.navHit.focus({ preventScroll: true });
  }
  private scheduleHD(delay = 160) {
    clearTimeout(this.hdTimer);
    if (!["SELECTING", "PDF_READING"].includes(this.state)) return;
    this.hdTimer = setTimeout(() => void this.renderHD(), delay);
  }
  private async renderHD() {
    if (!this.pdf || !this.reading || !["SELECTING", "PDF_READING"].includes(this.state)) return;
    const page = this.displayedPage, generation = this.generation;
    const width = Math.ceil(Math.max(900, this.readHit.getBoundingClientRect().width * Math.min(devicePixelRatio, 2) * this.zoom()));
    if (this.hdPage === page && this.hdWidth >= width * .9) return;
    this.hdJob?.abort(); const job = this.hdJob = new AbortController();
    this.el(".document-resolution").textContent = "RENDERING / 高清生成中";
    try {
      const raster = await this.pdf.raster(page, width, this.superPerformance ? 2_000_000 : 4_000_000, Math.min(4096, this.renderer.capabilities.maxTextureSize), job.signal);
      if (job.signal.aborted || generation !== this.generation || page !== this.displayedPage) { release(raster); return; }
      const texture = this.texture(raster), previous = this.hd;
      this.hd = { raster, texture }; this.hdPage = page; this.hdWidth = width;
      this.reading.setTexture(texture, raster.width / raster.height);
      previous?.texture.dispose(); release(previous?.raster);
      this.measureLayout();
      this.el(".document-resolution").textContent = `${raster.canvas.width} × ${raster.canvas.height}`;
    } catch (error) {
      if (!job.signal.aborted && generation === this.generation && !cancellation(error)) {
        this.el(".document-resolution").textContent = "预览画质";
        this.message("该页高清渲染失败，点击当前页码可重试。");
      }
    }
  }

  private buildProjection() {
    const points: THREE.Vector3[] = [];
    const core = new THREE.Vector3(0, -.08, -.15);
    for (const x of [-1.4, .85]) {
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4;
        points.push(new THREE.Vector3(x + .55 * Math.cos(angle), .18 + .55 * Math.sin(angle), .75), core.clone());
      }
    }
    for (const x of [-1.65, 1.65]) for (const y of [-1.1, 1.1]) points.push(core.clone(), new THREE.Vector3(x, y, -1.08));
    const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: "#bc945c", transparent: true, opacity: 0, depthWrite: false, depthTest: false }));
    lines.renderOrder = 4;
    this.projection.add(lines);
    const projectionMaterial = pdfPageMaterial({ transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
    this.projectionDark = projectionMaterial.dark;
    this.projectionPage = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), projectionMaterial.material);
    this.projectionPage.position.z = -1.075;
    this.projection.add(this.projectionPage);
  }
  private disposeProjection() {
    this.projection.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); }
    });
    this.projection.clear(); this.projectionPage = undefined;
  }
  private pick(event: PointerEvent) {
    if (!this.browsing) return;
    const rect = this.root.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2), this.camera);
    const objects = [...this.slices.values()].filter(slice => slice.root.visible).map(slice => slice.paper);
    const hit = this.raycaster.intersectObjects(objects, false)[0];
    this.hover = hit ? Number(hit.object.userData.page) : null;
    this.navHit.style.cursor = this.hover ? "pointer" : "grab";
    this.refreshHover();
  }
  private refreshHover() {
    this.el(".document-hover").textContent = `PAGE ${pad(this.hover ?? this.page)} / ${pad(this.pdf?.pageCount ?? 0)}${this.hover ? "  ↗ 抽出阅读" : ""}`;
  }
  private refreshHUD() {
    this.refreshHover();
    this.el<HTMLInputElement>(".document-range").value = String(this.page);
    this.el<HTMLInputElement>(".document-jump").value = String(this.page);
    this.el(".document-page-status").textContent = `${pad(this.displayedPage || this.page)} / ${pad(this.pdf?.pageCount ?? 0)}`;
    this.el<HTMLButtonElement>('[data-document="prev"]').disabled = (this.displayedPage || this.page) <= 1;
    this.el<HTMLButtonElement>('[data-document="next"]').disabled = (this.displayedPage || this.page) >= (this.pdf?.pageCount ?? 0);
  }
  private message(text: string, retry = false) {
    const element = this.el(".document-message"); element.hidden = !text;
    element.querySelector("span")!.textContent = text;
    element.querySelector<HTMLButtonElement>("button")!.hidden = !retry;
  }
  private jump() { this.locate(this.el<HTMLInputElement>(".document-jump").valueAsNumber); if (this.browsing) this.select(this.page); }
  private click(event: MouseEvent) {
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-document],[data-page]");
    if (!button || closingStates.has(this.state)) return;
    const action = button.dataset.document;
    if (action === "close") this.close();
    if (action === "retry") void this.load(this.attachment?.url);
    if (!this.browsing) return;
    if (button.dataset.page) this.select(Number(button.dataset.page));
    if (action === "jump") this.jump();
    if (action === "overview") this.overview();
    if (action === "prev" || action === "next") this.select((this.pendingPage ?? (this.displayedPage || this.page)) + (action === "next" ? 1 : -1));
    if (action === "zoom-in" || action === "zoom-out") this.changeZoom(action === "zoom-in" ? 1 / 1.15 : 1.15);
    if (action === "reset") this.resetView();
    if (action === "fit") this.fitWidth();
  }
  private keydown(event: KeyboardEvent) {
    event.stopPropagation();
    if (event.key === "Tab") {
      const nodes = [...this.root.querySelectorAll<HTMLElement>('button:not(:disabled),input,[tabindex="0"]')].filter(node => !node.closest("[inert]") && node.getClientRects().length && getComputedStyle(node).visibility !== "hidden");
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      return;
    }
    if (event.key === "Escape") { event.preventDefault(); if (["SELECTING", "PDF_READING"].includes(this.state)) this.overview(); else this.close(); return; }
    if (event.target instanceof HTMLInputElement) { if (event.key === "Enter" && event.target.type === "number") { event.preventDefault(); this.jump(); } return; }
    if (!this.browsing) return;
    const reading = (["SELECTING", "PDF_READING"].includes(this.state) || this.pendingPage !== null) && !this.el(".document-navigation").contains(event.target as Node);
    if (["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown", "PageUp", "PageDown"].includes(event.key)) {
      event.preventDefault();
      const next = (reading ? this.pendingPage ?? this.displayedPage : this.page) + (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key) ? -1 : 1);
      if (reading) this.select(next); else this.locate(next);
    }
    if (event.key === "Enter" && event.target === this.navHit) { event.preventDefault(); this.select(this.page); }
    if (event.key === "Home") { event.preventDefault(); if (reading) this.resetView(); else this.locate(1); }
    if (event.key === "End") { event.preventDefault(); this.locate(this.pdf!.pageCount); }
    if (["+", "=", "-"].includes(event.key)) { event.preventDefault(); this.changeZoom(event.key === "-" ? 1.15 : 1 / 1.15); }
  }
  private zoom() { return 10 / this.controlCamera.position.distanceTo(this.controls.target); }
  private changeZoom(factor: number) {
    this.cameraMotion.interruptReset(this.controlCamera, this.controls.target);
    const offset = this.controlCamera.position.clone().sub(this.controls.target);
    offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, 3, 22));
    this.controlCamera.position.copy(this.controls.target).add(offset); this.controls.update(); this.scheduleHD();
  }
  private resetView(animated = true) {
    this.controls.target.set(0, 0, 0); this.controlCamera.position.set(0, 0, 10); this.controls.update();
    if (animated && this.motion.viewerNavigation) this.cameraMotion.reset(); else this.cameraMotion.snap(this.controlCamera, this.controls.target);
    this.scheduleHD();
  }
  private fitWidth() {
    this.resetView();
    const region = this.region(this.readHit);
    const width = this.reading?.width ?? 3.1;
    const desired = region.width * .86 / (width * this.readScale);
    this.controlCamera.position.z = THREE.MathUtils.clamp(10 / desired, 3, 22);
    this.controls.update(); this.scheduleHD();
  }
  resize() {
    if (!this.isOpen) return;
    // Native MSAA preserves per-material toneMapped=false on PDF ink. An
    // OutputPass would tone-map the entire frame, washing out the page and
    // changing inversion. Keep the common resolution and texture budgets.
    const dimensions = resizeQuality(this.renderer, undefined, this.root, this.quality, this.superPerformance);
    this.root.dataset.renderQuality = JSON.stringify({ ...dimensions, antialias: "native-msaa", transmission: this.quality.transmission, superPerformance: this.superPerformance });
    this.camera.aspect = this.root.clientWidth / Math.max(1, this.root.clientHeight);
    this.camera.updateProjectionMatrix();
    this.measureLayout(); this.scheduleHD();
  }
  private region(element: HTMLElement) {
    const root = this.root.getBoundingClientRect(), box = element.getBoundingClientRect();
    const height = 2 * Math.tan(34 * Math.PI / 360) * 17;
    const width = height * root.width / Math.max(1, root.height);
    return { x: ((box.left + box.width / 2 - root.left) / root.width - .5) * width,
      y: (.5 - (box.top + box.height / 2 - root.top) / root.height) * height,
      width: box.width / root.width * width, height: box.height / root.height * height };
  }
  private measureLayout() {
    if (!this.isOpen) return;
    const nav = this.region(this.navHit), read = this.region(this.readHit);
    this.navPosition.set(nav.x, nav.y, 0); this.readPosition.set(read.x, read.y, 0);
    // Include all seven enclosures and their projected depth in the width.
    // Using one page's width lets the diagonal stack escape narrow viewports.
    this.navScale = Math.max(.01, Math.min(nav.width / 11, nav.height / 7.3));
    this.readScale = Math.min(read.width * .78 / (this.reading?.width ?? 3.1), read.height * .89 / (this.reading?.height ?? 4.12));
    const left = read.x - read.width / 2, right = read.x + read.width / 2;
    const bottom = read.y - read.height / 2, top = read.y + read.height / 2;
    this.readClip[0].setComponents(1, 0, left / 17, -left).normalize();
    this.readClip[1].setComponents(-1, 0, -right / 17, right).normalize();
    this.readClip[2].setComponents(0, 1, bottom / 17, -bottom).normalize();
    this.readClip[3].setComponents(0, -1, -top / 17, top).normalize();
  }

  private updateArchiveReturn() {
    const from = this.archiveReturn!, to = this.pose!;
    const amount = smooth(1 - this.intro / from.intro);
    const start = archiveFraming(from.camera), end = archiveFraming(to.camera);
    const halfHeight = THREE.MathUtils.lerp(start.halfHeight, end.halfHeight, amount);
    this.camera.fov = THREE.MathUtils.lerp(from.camera.fov, to.camera.fov, amount);
    this.camera.zoom = THREE.MathUtils.lerp(from.camera.zoom, to.camera.zoom, amount);
    this.camera.quaternion.slerpQuaternions(from.camera.quaternion, to.camera.quaternion, amount);
    // Move the projected center straight to its detail position while changing
    // framing smoothly. A world-position lerp plus lens/orientation changes
    // makes the archive swing to the right before returning to the left.
    this.camera.position.set(
      -THREE.MathUtils.lerp(start.x, end.x, amount) * halfHeight,
      -THREE.MathUtils.lerp(start.y, end.y, amount) * halfHeight,
      halfHeight * this.camera.zoom / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)),
    ).applyQuaternion(this.camera.quaternion);
    this.sourcePivot.quaternion.slerpQuaternions(from.rotation, to.rotation, amount);
  }

  update(time: number) {
    if (!this.isOpen) return;
    const dt = Math.max(0, Math.min(this.lastTime ? time - this.lastTime : 1 / 60, .05)); this.lastTime = time;
    // A common studio and camera preserve material continuity through projection.
    this.scene.background ??= new THREE.Color("#eae5e1");
    themeEnvironment(this.scene, this.renderer, this.theme);
    this.source?.model.traverse(child => { if (child.userData.themeAmount) child.userData.themeAmount.value = this.theme; });
    if (["EXPLODING", "PROJECTING", "ENTERING"].includes(this.state)) {
      this.intro = this.motion.viewerModelTransition ? Math.min(1, this.intro + dt / 4.6) : 1;
      const next: State = this.intro < .30 ? "EXPLODING" : this.intro < .62 ? "PROJECTING" : this.intro < 1 ? "ENTERING" : "PDF_OVERVIEW";
      if (next !== this.state) { this.setState(next); if (next === "PDF_OVERVIEW") this.navHit.focus({ preventScroll: true }); }
    }
    if (this.state === "RETRACTING") {
      this.intro = Math.max(.30, this.intro - dt / 1.8);
      if (this.intro <= .30) { this.setState("REASSEMBLING"); this.sound("assemble"); }
    }
    if (this.state === "REASSEMBLING" && this.spread.value < .001 && Math.abs(this.spread.velocity) < .01) {
      // Capture the displayed pose, including an interrupted opening animation.
      this.archiveReturn = { camera: this.camera.clone(), rotation: this.sourcePivot.quaternion.clone(), intro: this.intro };
      this.setState("RETURNING_ARCHIVE");
    }
    if (this.state === "RETURNING_ARCHIVE") {
      this.intro = this.motion.viewerModelTransition ? Math.max(0, this.intro - dt / 1.9) : 0;
      if (this.intro === 0) { this.finishClose(); return; }
    }
    const progress = this.intro;
    const expand = smooth(progress / .30), enter = smooth((progress - .65) / .35);
    const reassemble = this.state === "REASSEMBLING" || this.state === "RETURNING_ARCHIVE";
    const targetSpread = reassemble ? 0 : progress < .30 ? expand : 1;
    if (this.motion.viewerModelTransition) damp(this.spread, targetSpread, 5.5, dt);
    else this.spread = { value: targetSpread, velocity: 0 };
    if (this.source) spreadArchiveParts(this.parts, this.spread.value);
    const openingCamera = this.pose!.camera;
    const target = this.projectionCamera;
    this.camera.position.lerpVectors(openingCamera.position, target.position, expand);
    this.camera.quaternion.slerpQuaternions(openingCamera.quaternion, target.quaternion, expand);
    this.camera.fov = THREE.MathUtils.lerp(openingCamera.fov, 34, expand);
    this.camera.zoom = THREE.MathUtils.lerp(openingCamera.zoom, 1, expand);
    const dolly = smooth((progress - .48) / .20);
    this.camera.position.lerp(this.substrateCamera.position, dolly);
    this.camera.quaternion.slerp(this.substrateCamera.quaternion, dolly);
    this.camera.position.lerp(this.readingCameraPosition, enter);
    this.camera.quaternion.slerp(this.identity, enter);
    this.sourcePivot.quaternion.copy(this.pose!.rotation).slerp(this.identity, expand);
    if (this.state === "RETURNING_ARCHIVE") this.updateArchiveReturn();
    this.camera.updateProjectionMatrix();
    this.sourcePivot.scale.setScalar(1);
    this.sourcePivot.position.copy(this.origin);
    this.sourcePivot.visible = progress < .97;
    const sourceOpacity = 1 - smooth((progress - .76) / .20);
    for (const [material, original] of this.sourceMaterials) {
      material.opacity = original.opacity * sourceOpacity;
      const transparent = original.transparent || sourceOpacity < .999;
      if (material.transparent !== transparent) { material.transparent = transparent; material.needsUpdate = true; }
      // Developing paper is transparent and absent from Three's transmission
      // prepass. The clear cover must not reject those fragments by depth.
      material.depthWrite = sourceOpacity > .95 && original.depthWrite && !(original.opticalCover && progress > .30);
    }
    this.projection.position.copy(this.sourcePivot.position); this.projection.quaternion.copy(this.sourcePivot.quaternion); this.projection.scale.copy(this.sourcePivot.scale);
    this.projection.visible = progress > .3 && progress < .98;
    if (this.projectionDark) this.projectionDark.value = this.theme;
    for (const object of this.projection.children) {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
        (object.material as THREE.MeshBasicMaterial).opacity = smooth((progress - .30) / .16) * (1 - smooth((progress - .58) / .14)) * (object instanceof THREE.LineSegments ? .55 : .75);
      }
    }
    // The background fades over the frozen detail canvas beneath the transparent
    // WebGL canvas, keeping the model visible throughout the archive handoff.
    const background = this.scene.background as THREE.Color;
    const backgroundColor = background.clone(); this.scene.background = null;
    this.renderer.setClearColor(backgroundColor, 0);
    this.el(".document-wash").style.backgroundColor = `#${backgroundColor.getHexString()}`;
    this.root.style.setProperty("--document-entry", String(enter));
    this.root.style.setProperty("--document-background", String(smooth(progress / .18)));
    // The actual navigation meshes first develop on the substrate, then lift
    // out and travel to their navigator positions. No substitute DOM/card fade.
    const develop = smooth((progress - .40) / .19);
    const transport = smooth((progress - .60) / .40);
    this.stack.visible = Boolean(this.pdf) && progress > .40;
    const substrate = new THREE.Vector3(0, 0, -1.1 * this.spread.value + .04).applyQuaternion(this.sourcePivot.quaternion);
    this.stack.position.lerpVectors(substrate, this.navPosition, transport);
    this.stack.position.z += Math.sin(transport * Math.PI) * 1.8;
    this.stack.quaternion.slerpQuaternions(this.sourcePivot.quaternion, this.navQuaternion, transport);
    this.stack.scale.setScalar(THREE.MathUtils.lerp(.74, this.navScale, transport));
    const pages = this.pdf ? pdfWindow(this.page, this.pdf.pageCount) : [];
    for (const [page, slice] of this.slices) {
      const p = pdfSlicePosition(pages.indexOf(page), pages.length);
      const active = page === (this.hover ?? this.page);
      const targetPosition = new THREE.Vector3(p.x, p.y + (active ? .48 : 0), p.z);
      if (progress < 1) targetPosition.lerpVectors(new THREE.Vector3(0, 0, pages.indexOf(page) * .035), targetPosition, transport);
      slice.root.position.lerp(targetPosition, this.motion.viewerNavigation ? 1 - Math.exp(-7.8 * dt) : 1);
      slice.root.rotation.y = -.04 * transport;
      slice.emphasis(active ? 1 : .38, this.theme);
      slice.setReveal(develop);
      slice.root.visible = this.thumbnails.has(page) && !(page === this.displayedPage && this.extraction.value > .015);
    }
    this.controls.update(); this.cameraMotion.update(this.controlCamera, this.controls.target, dt, !this.motion.viewerNavigation);
    const reading = ["SELECTING", "PDF_READING"].includes(this.state);
    if (this.motion.viewerNavigation) damp(this.extraction, reading ? 1 : 0, reading ? 9.4 : 15, dt);
    else this.extraction = { value: reading ? 1 : 0, velocity: 0 };
    if (this.state === "SELECTING" && this.extraction.value > .995) this.setState("PDF_READING");
    if (this.state === "RETURNING_PAGE" && this.extraction.value < .005) {
      if (this.pendingPage !== null) this.select(this.pendingPage);
      else this.setState("PDF_OVERVIEW");
    }
    if (this.reading) {
      this.reading.root.visible = progress > .70 && this.extraction.value > .002;
      const slice = this.slices.get(this.displayedPage);
      const from = slice ? slice.root.getWorldPosition(new THREE.Vector3()) : this.navPosition.clone();
      const amount = this.extraction.value;
      this.reading.root.position.lerpVectors(from, this.readPosition.clone().sub(this.cameraMotion.focus.clone().multiplyScalar(this.readScale)), amount);
      this.reading.root.position.z += Math.sin(amount * Math.PI) * 1.5;
      const rotation = this.orbitCamera.quaternion.clone().invert();
      this.reading.root.quaternion.slerpQuaternions(this.navQuaternion, rotation, amount);
      const zoom = 10 / this.orbitCamera.position.distanceTo(this.cameraMotion.focus);
      this.reading.root.scale.setScalar(THREE.MathUtils.lerp(this.navScale, this.readScale * zoom, amount));
      this.reading.emphasis(1, this.theme);
      this.reading.setReveal(1);
      this.reading.clip(amount > .985 ? this.readClip : null);
      this.el(".document-zoom").textContent = `${Math.round(zoom * 100)}%`;
    }
    this.renderer.render(this.scene, this.camera);
    this.scene.background = backgroundColor;
    if (time - this.statsTime > .25) {
      this.statsTime = time;
      this.root.dataset.stats = JSON.stringify({ state: this.state, intro: progress, page: this.page, readingPage: this.displayedPage,
        pages: this.pdf?.pageCount ?? 0, slices: this.slices.size, thumbnails: this.thumbnails.size, thumbnailJobs: this.thumbBusy,
        highResolutionPages: this.hd ? 1 : 0, highResolutionPixels: this.hd ? this.hd.raster.canvas.width * this.hd.raster.canvas.height : 0,
        textures: this.renderer.info.memory.textures, camera: this.controlCamera.position.toArray(),
        spread: this.spread.value, targetSpread, develop, transport, dark: this.theme,
        yaw: this.controls.getAzimuthalAngle(), pitch: this.controls.getPolarAngle() - Math.PI / 2,
        projectedPages: [...this.slices].map(([page, slice]) => ({ page, x: slice.root.getWorldPosition(new THREE.Vector3()).project(this.camera).x })) });
    }
  }
  close() {
    if (!this.isOpen || closingStates.has(this.state)) return;
    this.loadJob?.abort(); this.hdJob?.abort(); clearTimeout(this.hdTimer);
    for (const job of this.thumbJobs.values()) job.abort();
    this.pendingPage = null;
    this.setState(this.intro > .30 ? "RETRACTING" : "REASSEMBLING"); this.message("");
    if (!this.motion.viewerModelTransition || this.intro === 0) this.finishClose();
  }
  private clearDocument() {
    this.generation++; this.loadJob?.abort(); this.hdJob?.abort(); clearTimeout(this.hdTimer);
    for (const job of this.thumbJobs.values()) job.abort();
    this.thumbJobs.clear(); this.thumbBusy = 0; this.thumbFailures.clear();
    this.pdf?.destroy(); this.pdf = undefined;
    this.reading?.dispose(); this.reading = undefined;
    for (const slice of this.slices.values()) slice.dispose(); this.slices.clear();
    if (this.projectionPage) { this.projectionPage.material.map = null; this.projectionPage.material.needsUpdate = true; }
    for (const entry of this.thumbnails.values()) { entry.texture.dispose(); release(entry.raster); } this.thumbnails.clear();
    this.hd?.texture.dispose(); release(this.hd?.raster); this.hd = undefined;
    this.hdPage = 0; this.hdWidth = 0; this.displayedPage = 0; this.extraction = { value: 0, velocity: 0 };
    this.el(".document-resolution").textContent = "";
    this.pendingPage = null;
  }
  private finishClose() {
    this.archiveReturn = undefined;
    this.clearDocument(); this.disposeProjection();
    this.factory?.dispose(); this.factory = undefined;
    this.source?.model.removeFromParent(); this.source?.dispose(); this.source = undefined; this.parts.clear();
    this.sourceMaterials.clear();
    this.renderer.renderLists.dispose();
    this.setState("CLOSED"); this.root.hidden = true;
    this.root.dataset.stats = JSON.stringify({ state: "CLOSED", pages: 0, slices: 0, thumbnails: 0, thumbnailJobs: 0, highResolutionPages: 0, highResolutionPixels: 0, textures: this.renderer.info.memory.textures });
    delete this.root.parentElement!.dataset.documentActive;
    this.siblings.forEach(({ node, inert }) => node.inert = inert); this.siblings = [];
    this.opener?.focus({ preventScroll: true }); this.onClose();
  }
  dispose() {
    if (this.isOpen) this.finishClose();
    this.resizeObserver.disconnect(); this.controls.dispose();
    this.scene.environment?.dispose();
    this.renderer.dispose(); this.renderer.forceContextLoss(); this.root.remove();
  }
}
