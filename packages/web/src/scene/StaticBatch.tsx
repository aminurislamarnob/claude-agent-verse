import { useLayoutEffect, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// ── Static batching ──────────────────────────────────────────
// Furniture is authored as many small meshes for readability, which costs a draw
// call each. StaticBatch merges the meshes under it into one mesh per material
// look after they mount, and hides the originals. Anything that animates opts out
// with `userData={{ live: true }}` (its whole subtree is skipped); instanced meshes
// are always skipped. The batch rebuilds whenever `version` changes, so pass every
// prop that changes how the furniture looks.

const LIVE = "live";

function materialKey(m: THREE.Material, mesh: THREE.Mesh): string {
  const x = m as THREE.MeshPhysicalMaterial;
  return [
    m.type,
    x.color?.getHexString(),
    x.emissive?.getHexString(),
    x.emissiveIntensity,
    x.roughness,
    x.metalness,
    x.map?.uuid,
    x.sheen,
    x.clearcoat,
    m.transparent,
    m.opacity,
    m.side,
    m.toneMapped,
    m.depthWrite,
    mesh.castShadow,
    mesh.receiveShadow,
  ].join("|");
}

function collect(obj: THREE.Object3D, out: THREE.Mesh[]) {
  if (obj.userData[LIVE] || !obj.visible) return;
  const mesh = obj as THREE.Mesh;
  if (mesh.isMesh && !(obj as THREE.InstancedMesh).isInstancedMesh && !Array.isArray(mesh.material)) out.push(mesh);
  for (const child of obj.children) collect(child, out);
}

function batch(root: THREE.Group) {
  root.updateWorldMatrix(true, true);
  const toLocal = root.matrixWorld.clone().invert();
  const meshes: THREE.Mesh[] = [];
  for (const child of root.children) collect(child, meshes);

  const groups = new Map<string, { material: THREE.Material; meshes: THREE.Mesh[] }>();
  for (const mesh of meshes) {
    const g = mesh.geometry;
    if (!g.attributes.position || !g.attributes.normal || !g.attributes.uv) continue;
    const key = materialKey(mesh.material as THREE.Material, mesh);
    let entry = groups.get(key);
    if (!entry) groups.set(key, (entry = { material: mesh.material as THREE.Material, meshes: [] }));
    entry.meshes.push(mesh);
  }

  const merged: THREE.Mesh[] = [];
  const hidden: THREE.Mesh[] = [];
  const m = new THREE.Matrix4();
  for (const { material, meshes: list } of groups.values()) {
    if (list.length < 2) continue; // nothing to gain
    const parts = list.map((mesh) => {
      let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
      g.morphAttributes = {};
      g = g.applyMatrix4(m.multiplyMatrices(toLocal, mesh.matrixWorld));
      return g;
    });
    const geometry = mergeGeometries(parts, false);
    parts.forEach((p) => p.dispose());
    if (!geometry) continue;
    const out = new THREE.Mesh(geometry, material);
    out.castShadow = list[0].castShadow;
    out.receiveShadow = list[0].receiveShadow;
    out.raycast = () => {}; // furniture isn't clickable; keep picking cheap
    merged.push(out);
    for (const mesh of list) {
      mesh.visible = false;
      hidden.push(mesh);
    }
  }
  const holder = new THREE.Group();
  holder.add(...merged);
  root.add(holder);
  return () => {
    root.remove(holder);
    merged.forEach((x) => x.geometry.dispose());
    hidden.forEach((x) => (x.visible = true));
  };
}

export function StaticBatch({ version, children }: { version: string; children: ReactNode }) {
  const root = useRef<THREE.Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    if (!root.current) return;
    const undo = batch(root.current);
    invalidate();
    return undo;
  }, [version, invalidate]);
  return <group ref={root}>{children}</group>;
}
