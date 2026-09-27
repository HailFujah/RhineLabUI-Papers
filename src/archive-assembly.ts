import * as THREE from "three";

/** One physical breakdown for the object study and document projection. */
export const ARCHIVE_PARTS = [
  { id: "fasteners", label: "紧固件", en: "FASTENERS", depth: 2.75 },
  { id: "cover", label: "透明盖板", en: "OPTICAL COVER", depth: 1.85 },
  { id: "optical-lenses", label: "折射环组", en: "REFRACTIVE RINGS", depth: .75 },
  { id: "optical-core", label: "光学核心", en: "OPTICAL CORE", depth: -.15 },
  { id: "substrate", label: "信息基板", en: "SUBSTRATE", depth: -1.1 },
  { id: "carrier", label: "背板与框架", en: "CARRIER", depth: -2.05 },
] as const;
export type ArchiveModelSource = { model: THREE.Group; dispose: () => void; setClarity?: (value: number) => void };
export type ArchiveDocumentPose = { camera: THREE.PerspectiveCamera; rotation: THREE.Quaternion };

export function groupArchiveParts(model: THREE.Group) {
  const groups = new Map<string, THREE.Group>(ARCHIVE_PARTS.map(part => {
    const group = new THREE.Group();
    group.name = part.id;
    return [part.id, group];
  }));
  for (const child of [...model.children]) groups.get(child.userData.assemblyPart ?? "cover")?.add(child);
  for (const group of groups.values()) model.add(group);
  return groups;
}
export function spreadArchiveParts(groups: Map<string, THREE.Group>, progress: number) {
  for (const part of ARCHIVE_PARTS) groups.get(part.id)!.position.z = part.depth * progress;
}
