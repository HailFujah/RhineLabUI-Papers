import assert from "node:assert/strict";
import * as THREE from "three";
import { WebGLRenderLists } from "three/src/renderers/webgl/WebGLRenderLists.js";
import { DocumentSourceFade } from "../src/document-source-fade.ts";

const model = new THREE.Group(), scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
const geometry = new THREE.BoxGeometry(1, 1, 1);
const body = new THREE.Mesh(geometry, new THREE.MeshPhysicalMaterial());
const cover = new THREE.Mesh(geometry, new THREE.MeshPhysicalMaterial({ transmission: .985 }));
cover.userData.surface = "Frosted_Polymer";
const optics = new THREE.Mesh(geometry, new THREE.MeshPhysicalMaterial({ opacity: .27, depthWrite: false, blending: THREE.CustomBlending }));
const label = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
const meshes = [body, cover, optics, label];
model.add(...meshes); scene.add(model);
const clarity = { value: 1 };
cover.material.onBeforeCompile = shader => { shader.uniforms.archiveClarity = clarity; };
cover.material.customProgramCacheKey = () => "original-cover";
const fade = new DocumentSourceFade(model);
const shaders = new Map(meshes.map(mesh => {
  const shader = { uniforms: {}, fragmentShader: "#include <opaque_fragment>" };
  mesh.material.onBeforeCompile(shader, {});
  assert.match(shader.fragmentShader, /gl_FragColor\.a \*= documentSourceOpacity/);
  return [mesh, shader];
}));
assert.equal(shaders.get(cover).uniforms.archiveClarity, clarity);
assert.equal(cover.material.customProgramCacheKey(), "original-cover-document-source-fade");
assert.equal(body.material.blendSrc, THREE.SrcAlphaFactor);
assert.equal(body.material.blendDstAlpha, THREE.OneMinusSrcAlphaFactor);
const lists = new WebGLRenderLists(), list = lists.get(scene, 0);
for (const opacity of [0, .1, .5, .94, .96, .998, 1]) {
  for (const developing of [false, true]) {
    fade.set(opacity, developing);
    list.init();
    for (const mesh of meshes) list.push(mesh, geometry, mesh.material, 0, 0, null);
    assert.deepEqual(list.opaque.map(item => item.object), [body, optics]);
    assert.deepEqual(list.transmissive.map(item => item.object), [cover]);
    assert.deepEqual(list.transparent.map(item => item.object), [label]);
    for (const capture of [true, false]) {
      const renderer = { getRenderTarget: () => capture ? {} : null };
      for (const mesh of meshes) {
        mesh.onBeforeRender(renderer, scene, camera, geometry, mesh.material, null);
        assert.equal(shaders.get(mesh).uniforms.documentSourceOpacity.value, capture ? 1 : opacity);
      }
      assert.equal(body.material.depthWrite, true);
      assert.equal(cover.material.depthWrite, capture || !developing);
      assert.equal(optics.material.depthWrite, false);
      assert.equal(label.material.depthWrite, false);
      assert.equal(optics.material.opacity, .27);
      assert.equal(cover.material.transmission, .985);
    }
  }
}
lists.dispose(); geometry.dispose(); meshes.forEach(mesh => mesh.material.dispose());
console.log("Document source fade: stable native render lists, full transmission capture, final-pass fade and projection depth passed (no GPU visual check).");
