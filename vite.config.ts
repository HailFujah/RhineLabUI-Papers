import { defineConfig } from "vite";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";

// Keep Blender's stable source/export paths, while production URLs identify
// exact bytes and can be cached without revalidation across deployments.
const models = ["archive-cassette", "archive-assembly"].map(name => {
  const source = readFileSync(`public/assets/${name}.glb`);
  const hash = createHash("sha256").update(source).digest("hex").slice(0,16);
  return { key:`assets/${name}.glb`, fileName:`assets/${name}.${hash}.glb`, source };
});
const hasNovecento = ["Normal", "DemiBold", "Bold"].every(weight =>
  existsSync(`public/fonts/novecento/webFonts/NovecentoSansWide${weight}/font.woff2`),
);
// PDF.js requests CMaps, fallback fonts and image decoders on demand. Keep
// these same-origin, versioned and available to the existing offline packager.
const pdfVersion = JSON.parse(readFileSync("node_modules/pdfjs-dist/package.json", "utf8")).version;
const pdfAssets = ["cmaps", "standard_fonts", "wasm"].flatMap(directory =>
  readdirSync(`node_modules/pdfjs-dist/${directory}`).map(name => ({
    fileName: `pdfjs/${pdfVersion}/${directory}/${name}`,
    source: readFileSync(`node_modules/pdfjs-dist/${directory}/${name}`),
  })),
);
export default defineConfig(({ mode, command }) => ({
  base: mode === "wallpaper" ? "./" : "/",
  define: {
    __RHINE_MODELS__: JSON.stringify(Object.fromEntries(models.map(model => [model.key,model.fileName]))),
    __RHINE_NOVECENTO__: JSON.stringify(hasNovecento),
  },
  plugins: [{
    name: "versioned-model-assets", apply: "build",
    buildStart() { for (const model of models) this.emitFile({type:"asset",fileName:model.fileName,source:model.source}); },
  }, {
    name: "pdf-decoder-assets",
    buildStart() { if (command === "build") for (const asset of pdfAssets) this.emitFile({ type: "asset", ...asset }); },
    configureServer(server) {
      const assets = new Map(pdfAssets.map(asset => [`/${asset.fileName}`, asset.source]));
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split("?")[0] ?? "";
        const source = assets.get(path);
        if (!source) { next(); return; }
        response.setHeader("Content-Type", path.endsWith(".wasm") ? "application/wasm" : "application/octet-stream");
        response.end(source);
      });
    },
  }, ...(mode === "wallpaper" ? [{
    name: "wallpaper-host",
    transformIndexHtml(html: string) {
      return { html: html.replace(/\s*<link rel="manifest"[^>]*>/, ""), tags: [{
        tag: "script", children: readFileSync("wallpaper/host.js", "utf8"), injectTo: "head-prepend" as const,
      }] };
    },
  }] : [])],
}));
