import * as THREE from "three";
import { pdfPageMaterial } from "./pdf-material";

type OpticalPart = { geometry: THREE.BufferGeometry; detail: boolean };

/** The thin cover and corner engravings come from the existing Blender asset.
 * The deep carrier rails and optical machinery do not belong on a page slide. */
export class PdfSliceFactory {
  private templates: OpticalPart[] = [];
  readonly plane = new THREE.PlaneGeometry(1, 1);
  constructor(model: THREE.Group) {
    model.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const surface = object.userData.surface;
      if (surface === "Frosted_Polymer" || surface === "Index_Inlay" || (object.userData.assemblyPart === "fasteners" && surface === "Titanium_Fasteners"))
        this.templates.push({ geometry: object.geometry, detail: surface !== "Frosted_Polymer" });
    });
  }
  create(page: number) { return new PdfSlice(this.plane, this.templates, page); }
  dispose() { this.plane.dispose(); }
}

export class PdfSlice {
  readonly root = new THREE.Group();
  readonly enclosure = new THREE.Group();
  readonly paper: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private glass = new THREE.MeshPhysicalMaterial({ color: "#efede5", roughness: .23, metalness: 0,
    transmission: .55, thickness: .045, ior: 1.46, transparent: true, opacity: .62,
    clearcoat: .8, clearcoatRoughness: .16, depthWrite: false, side: THREE.DoubleSide });
  private corners = new THREE.MeshStandardMaterial({ color: "#d0d0c6", roughness: .3, metalness: .45, transparent: true });
  private badge: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private badgeTexture: THREE.CanvasTexture;
  private back: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private labelCanvas = document.createElement("canvas");
  private pdfDark: { value: number };
  private reveal = 1;
  private active = 1;
  private theme = 0;
  width = 3.5;
  height = 4.05;
  page: number;
  constructor(plane: THREE.PlaneGeometry, templates: OpticalPart[], page: number) {
    this.page = page;
    const body = new THREE.Group();
    for (const part of templates) body.add(new THREE.Mesh(part.geometry, part.detail ? this.corners : this.glass));
    body.position.set(0, -1.85, -.19);
    this.enclosure.add(body); this.root.add(this.enclosure);
    const pdf = pdfPageMaterial({ transparent: true }); this.pdfDark = pdf.dark;
    this.paper = new THREE.Mesh(plane, pdf.material);
    this.paper.position.set(.11, -.025, .032);
    this.paper.userData.page = page; this.root.add(this.paper);
    this.labelCanvas.width = 384; this.labelCanvas.height = 70;
    this.badgeTexture = new THREE.CanvasTexture(this.labelCanvas);
    this.badgeTexture.colorSpace = THREE.SRGBColorSpace;
    this.badge = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: this.badgeTexture, toneMapped: false, transparent: true }));
    this.badge.rotation.z = Math.PI / 2;
    this.root.add(this.badge);
    this.back = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ color: "#e5e2d9", side: THREE.BackSide, transparent: true }));
    this.back.position.set(.11, -.025, -.025); this.root.add(this.back);
    this.setPage(page); this.setAspect(612 / 792);
  }
  setPage(page: number) {
    this.page = page; this.paper.userData.page = page;
    const ctx = this.labelCanvas.getContext("2d")!;
    ctx.clearRect(0, 0, 384, 70);
    ctx.fillStyle = "#e7e6df"; ctx.fillRect(0, 0, 384, 70);
    ctx.fillStyle = "#343831"; ctx.font = "bold 22px monospace";
    ctx.fillText(`RL / ${String(page).padStart(3, "0")}`, 12, 28);
    ctx.font = "13px monospace"; ctx.fillText("OPTICAL DOCUMENT", 12, 52);
    for (let i = 0; i < 28; i++) ctx.fillRect(263 + i * 4, 10, i % 3 === 0 ? 2 : 1, 48);
    this.badgeTexture.needsUpdate = true;
  }
  setAspect(ratio: number) {
    const h = ratio > 1 ? 3.5 / ratio : 3.5, w = h * ratio;
    this.width = w + .68; this.height = h + .5;
    this.enclosure.scale.set(this.width / 5, this.height / 3.7, 1);
    this.paper.scale.set(w, h, 1); this.back.scale.copy(this.paper.scale);
    this.badge.scale.set(.79, .145, 1);
    this.badge.position.set(-this.width / 2 + .17, this.height / 2 - .65, .039);
  }
  setTexture(texture: THREE.Texture | null, ratio?: number) {
    this.paper.visible = Boolean(texture);
    this.paper.material.map = texture; this.paper.material.needsUpdate = true;
    if (ratio) this.setAspect(ratio);
  }
  emphasis(active: number, theme: number) {
    this.active = active; this.theme = theme; this.pdfDark.value = theme;
    this.glass.color.set("#efede5").lerp(new THREE.Color("#76898d"), theme);
    this.corners.color.set("#d0d0c6").lerp(new THREE.Color("#a7b3b2"), theme);
    this.back.material.color.set("#e5e2d9").lerp(new THREE.Color("#192226"), theme);
    this.badge.material.color.setScalar(1 - theme * .45);
    this.paper.material.color.setScalar(.91 + active * .09);
    this.applyOpacity();
  }
  setReveal(value: number) { this.reveal = value; this.applyOpacity(); }
  private applyOpacity() {
    this.glass.opacity = this.reveal * (.45 + this.active * .2);
    this.corners.opacity = this.reveal;
    this.paper.material.opacity = this.reveal;
    // Once developed, treat the ink as opaque so it participates in the glass
    // transmission prepass and naturally occludes adjacent lifted pages.
    const transparent = this.reveal < .999;
    if (this.paper.material.transparent !== transparent) {
      this.paper.material.transparent = transparent;
      this.paper.material.needsUpdate = true;
    }
    this.back.material.opacity = this.reveal;
    this.badge.material.opacity = this.reveal;
    this.paper.material.depthWrite = this.reveal > .99;
    this.back.material.depthWrite = this.reveal > .99;
  }
  clip(planes: THREE.Plane[] | null) {
    for (const material of [this.glass, this.corners, this.paper.material, this.back.material, this.badge.material]) {
      if (material.clippingPlanes === planes) continue;
      material.clippingPlanes = planes; material.needsUpdate = true;
    }
  }
  dispose() {
    this.root.removeFromParent();
    this.glass.dispose(); this.corners.dispose(); this.paper.material.dispose(); this.back.material.dispose(); this.badge.material.dispose();
    this.badgeTexture.dispose(); this.labelCanvas.width = this.labelCanvas.height = 1;
  }
}
