import * as THREE from "three";

/** Invert the rendered PDF in output colour space, leaving its source raster
 * untouched. Thumbnails, the optical projection and the reader use one shader. */
export function pdfPageMaterial(options: THREE.MeshBasicMaterialParameters = {}) {
  const material = new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false, ...options });
  const dark = { value: 0 };
  material.onBeforeCompile = shader => {
    shader.uniforms.pdfDark = dark;
    shader.fragmentShader = `uniform float pdfDark;\n${shader.fragmentShader}`.replace(
      "#include <colorspace_fragment>",
      "#include <colorspace_fragment>\n gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0) - gl_FragColor.rgb, pdfDark);",
    );
  };
  material.customProgramCacheKey = () => "rhine-pdf-inversion-v1";
  return { material, dark };
}
