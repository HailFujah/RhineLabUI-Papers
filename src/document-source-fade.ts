import * as THREE from "three";

/** Fade the final archive image without removing its interior from the native
 * transmission capture. Materials keep their original render-list membership. */
export class DocumentSourceFade {
  private opacity = 1;
  private developing = false;

  constructor(model: THREE.Group) {
    const states = new Map<THREE.Material, { fade: { value: number }; depthWrite: boolean; opticalCover: boolean }>();
    model.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials: THREE.Material[] = [object.material].flat();
      for (const material of materials) {
        if (states.has(material)) continue;
        const fade = { value: 1 };
        states.set(material, { fade, depthWrite: material.depthWrite, opticalCover: object.userData.surface === "Frosted_Polymer" });
        // As with the existing internal optics, explicit alpha blending leaves
        // these objects in the opaque capture. NormalBlending + !transparent
        // would force alpha to 1 in Three's OPAQUE shader variant.
        if (!material.transparent && material.blending === THREE.NormalBlending) {
          material.blending = THREE.CustomBlending;
          material.blendEquation = THREE.AddEquation;
          material.blendSrc = material.premultipliedAlpha ? THREE.OneFactor : THREE.SrcAlphaFactor;
          material.blendDst = THREE.OneMinusSrcAlphaFactor;
          material.blendSrcAlpha = THREE.OneFactor;
          material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
        }
        const beforeCompile = material.onBeforeCompile;
        const cacheKey = material.customProgramCacheKey();
        material.onBeforeCompile = (shader, renderer) => {
          beforeCompile.call(material, shader, renderer);
          shader.uniforms.documentSourceOpacity = fade;
          shader.fragmentShader = "uniform float documentSourceOpacity;\n" + shader.fragmentShader.replace(
            "#include <opaque_fragment>", "#include <opaque_fragment>\ngl_FragColor.a *= documentSourceOpacity;",
          );
        };
        material.customProgramCacheKey = () => `${cacheKey}-document-source-fade`;
        material.needsUpdate = true;
      }
      const beforeRender = object.onBeforeRender;
      object.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
        beforeRender.call(object, renderer, scene, camera, geometry, material, group);
        const state = states.get(material)!;
        // DocumentViewer renders straight to the canvas: only its native
        // transmission prepass has a render target, just like the backdrop.
        const capture = renderer.getRenderTarget() !== null;
        state.fade.value = capture ? 1 : this.opacity;
        material.depthWrite = state.depthWrite && (capture || !state.opticalCover || !this.developing);
      };
    });
  }

  set(opacity: number, developing: boolean) {
    this.opacity = THREE.MathUtils.clamp(opacity, 0, 1);
    this.developing = developing;
  }
}
