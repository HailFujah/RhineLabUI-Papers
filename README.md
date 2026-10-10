# RhineLabUI Papers · AI 论文阅读与管理 / AI Paper Reader & Library

基于 **[LBEILC / RhineLabUI](https://github.com/LBEILC/RhineLabUI)** 的论文阅读与管理扩展，将 AI 领域论文接入莱茵生命风格的三维档案阵列，提供 PDF 光学切片阅读、个人论文导入和浏览器本地缓存。

A paper reading and library extension built on **[LBEILC / RhineLabUI](https://github.com/LBEILC/RhineLabUI)**. It brings AI research papers into a Rhine Lab inspired 3D archive, with optical-slice PDF reading, personal PDF imports, and browser-local storage.

> “AI 论文”指研究领域；当前没有接入大模型问答、自动翻译或 AI 总结服务。本项目是完整网页应用，不是可单独安装的浏览器插件。
>
> “AI papers” refers to the research subject. This app does not currently provide LLM chat, automatic translation, or AI summaries. It is a web application, not an installable browser extension.

## 基底与署名 / Upstream & credits

| 项目 / Item | 来源 / Source |
| --- | --- |
| 原项目 / Original project | [LBEILC/RhineLabUI](https://github.com/LBEILC/RhineLabUI) |
| 原作者 / Original author | [LBEILC](https://github.com/LBEILC) |
| 本扩展仓库 / This extension | [HailFujah/RhineLabUI-Papers](https://github.com/HailFujah/RhineLabUI-Papers) |
| 扩展维护者 / Extension maintainer | [HailFujah](https://github.com/HailFujah) |
| 许可证 / License | [MIT](LICENSE), preserving `Copyright (c) 2026 LBEILC` |

**继承自原项目：** 三维档案阵列、模型与建模脚本、开场与解密动效、主题、声音、画质设置和 PWA 基础设施。本扩展不将这些成果声称为原创。

**Inherited from upstream:** the 3D archive, models and modeling scripts, boot and decryption animations, themes, audio, quality settings, and PWA infrastructure. This extension does not claim authorship of that foundation.

**本扩展内容：** PDF 阅读与导入、论文元数据和千篇目录、本地文件缓存、收藏与阅读记录，以及论文导航和鼠标拖动优化。代码开发由 GPT-6 Astra 协助；原项目的模型制作采用 Blender MCP 工作流。

**Extension work:** PDF reading and import, paper metadata and a 1,000-paper catalog, local file caching, favorites and reading history, and improvements to paper navigation and mouse dragging. Development was assisted by GPT-6 Astra; upstream models were produced with a Blender MCP workflow.

[上游在线演示 / Upstream live demo](https://rhine.lubeiluchen.cc/) 由原作者维护，**不是本扩展的在线部署**。本扩展的运行方法见下文。

The upstream demo is maintained by the original author and **does not host this extension**. Follow the instructions below to run this version.

## 功能 / Features

- **千篇目录：** 100 篇代表论文、400 篇 ACL／ICML 会议论文、500 篇近期 arXiv 论文。这是固定选集，没有自动每日更新。
  **1,000-paper catalog:** 100 representative papers, 400 ACL/ICML conference papers, and 500 recent arXiv papers. This is a fixed selection, not a live database or daily feed.
- **横向切类别，纵向切论文：** 支持键盘、按钮、滚轮和触摸；鼠标左键长按可自由拖动三维阵列，中途转向或反向。
  **Horizontal categories, vertical papers:** keyboard, buttons, wheel, and touch navigation. Hold the left mouse button to freely drag the 3D array, including turns and reversals within one gesture.
- **PDF 光学阅读：** 页面切片导航、逐页阅读、缩放、平移、适宽、明暗主题，以及模型拆解／重组过渡。
  **Optical PDF reader:** page slices, page navigation, zoom, pan, fit to width, light/dark themes, and model disassembly/reassembly transitions.
- **个人论文库：** 导入 PDF，提取文字和元信息，编辑标题、作者、机构、发表日期、期刊／会议、摘要和参考文献。缺失字段可手动补全；不含 OCR 或自动翻译。
  **Personal library:** import PDFs, extract text and metadata, and edit titles, authors, affiliations, dates, venues, abstracts, and references. Missing fields can be entered manually; OCR and automatic translation are not included.
- **本地保存：** 官方 PDF 按需下载，导入文件不上传服务器；PDF、收藏和阅读记录保存在当前浏览器中。
  **Local storage:** official PDFs download on demand; imported files are not uploaded. PDFs, favorites, and reading history stay in the current browser.
- **保留原档案库：** 原项目五类、40 份演示档案与论文库独立，可从 `UPLOAD ARCHIVE` 切换。
  **Original archive retained:** the original five categories and 40 demo archives remain separate from the paper library and are accessible through `UPLOAD ARCHIVE`.

## 依赖与插件 / Requirements & plugins

**普通使用不需要浏览器 PDF 插件、Codex 插件、Blender MCP 或 AI API Key。** `npm ci` 会安装网页需要的软件依赖。

**Normal use requires no browser PDF plugin, Codex plugin, Blender MCP, or AI API key.** Install the application's dependencies with `npm ci`.

| 场景 / Use case | 依赖 / Requirement | 说明 / Notes |
| --- | --- | --- |
| 本地运行与构建 / Run & build | Node.js 22.13+ or 24+, npm | 本地验证使用 Node 24 / Locally tested with Node 24 |
| 浏览与阅读 / Browse & read | WebGL 2, Web Workers, IndexedDB | 现代浏览器，建议硬件加速 / Modern browser; hardware acceleration recommended |
| PDF 解析与渲染 / PDF parsing & rendering | `pdfjs-dist` | npm 自动安装；worker、字体、CMap、WASM 同源提供 / Installed by npm; worker, fonts, CMaps and WASM served from the app's origin |
| 三维界面与动画 / 3D & animation | `three`, `@kitlangton/rolling-number` | npm 自动安装 / Installed by npm |
| 内置论文首次下载 / First catalog PDF download | 网络及同源 `/api/papers/:slug` / Network and same-origin endpoint | Vite 开发与预览已集成 / Included in Vite dev and preview |
| 修改模型，可选 / Model editing, optional | Blender | 使用现成 GLB 不需要；AI 控制 Blender 才需配置 Blender MCP / Not needed for shipped GLBs; Blender MCP is only needed for AI control of Blender |
| 浏览器测试，可选 / Browser tests, optional | Playwright, Microsoft Edge | 可通过 `PLAYWRIGHT_MODULE` 指定模块路径 / Scripts accept a module path via `PLAYWRIGHT_MODULE` |
| 重建目录，可选 / Catalog maintenance, optional | Python 3 | `scripts/import-paper-catalog.py`; 普通运行无需 Python / Not required to run the app |

## 快速运行 / Quick start

从本仓库克隆，或使用 GitHub 的 **Code → Download ZIP** 解压后进入项目根目录。

Clone this repository, or use **Code → Download ZIP** on GitHub and open a terminal in the extracted project directory.

```sh
git clone https://github.com/HailFujah/RhineLabUI-Papers.git
cd RhineLabUI-Papers
npm ci
npm run dev
```

打开终端打印的地址，通常为 `http://127.0.0.1:5173/`。首次安装依赖需要联网；本地服务已包含论文下载接口，不需要另起后端进程。

Open the URL printed in the terminal, usually `http://127.0.0.1:5173/`. Dependency installation requires network access. The local service includes the paper download endpoint; no separate backend process is needed.

如需使用 5205 端口并直接进入阵列：

To use port 5205 and open the archive directly:

```sh
npm run dev -- --port 5205 --strictPort
```

访问 `http://127.0.0.1:5205/?scene=archive`。**保持终端服务运行**；`ERR_CONNECTION_REFUSED` 通常表示服务没有启动或已退出。这个地址只属于运行服务的本机。

Visit `http://127.0.0.1:5205/?scene=archive`. **Keep the server running**; `ERR_CONNECTION_REFUSED` usually means it has not started or has stopped. This address is local to the computer running the server.

Windows 用户安装 Node.js 后，也可双击 [`启动终端.cmd`](启动终端.cmd) 自动安装依赖、启动并打开浏览器。

On Windows, after installing Node.js, you can also double-click [`启动终端.cmd`](启动终端.cmd) to install dependencies, start the service, and open the browser.

### 构建与预览 / Build & preview

```sh
npm run build
npm run preview
```

输出目录为 `dist/`。通过 HTTP 服务访问，不要直接双击 `dist/index.html`。`npm run preview` 同样包含论文下载接口。

The build output is `dist/`. Serve it over HTTP instead of opening `dist/index.html` directly. `npm run preview` also includes the paper download endpoint.

### 线上部署与字体 / Deployment & fonts

- **Cloudflare Pages：** 同时部署前端与根目录 `functions/`，才能提供 `/api/papers/:slug`。接口只代理目录白名单内的官方 PDF。
  **Cloudflare Pages:** deploy the frontend together with the root `functions/` directory to provide `/api/papers/:slug`. The endpoint only proxies official PDF URLs from the catalog allowlist.
- **其他平台：** 使用 `npm run build` 的 `dist/`，并实现与 [`server/paper-source.ts`](server/paper-source.ts) 等效的同源接口。仓库没有通用 Node 生产服务启动命令。
  **Other platforms:** deploy `dist/` from `npm run build` and provide an equivalent same-origin endpoint based on [`server/paper-source.ts`](server/paper-source.ts). No generic production Node server command is included.
- **纯静态托管：** GitHub Pages 或只上传静态 ZIP 不会提供下载接口；可以使用界面与本地 PDF 导入／缓存，无法直接完成内置论文的首次下载。
  **Static-only hosting:** GitHub Pages or a static ZIP deployment does not supply the endpoint. The UI, local PDF imports, and existing caches remain usable, but initial catalog PDF downloads require a backend.
- **原 Cloudflare 发行命令：** `npm run build:cloudflare` 会校验原作者授权的 Novecento 字体文件，缺失时会停止。新克隆请使用普通 `npm run build`；原托管配置见 [部署记录](docs/CLOUDFLARE-DEPLOYMENT.md)。
  **Upstream Cloudflare packaging:** `npm run build:cloudflare` validates the original author's licensed Novecento files and stops if they are missing. Fresh clones should use `npm run build`; see the [upstream deployment notes](docs/CLOUDFLARE-DEPLOYMENT.md) for the original setup.
- **商业字体：** Novecento Webfont 不进入 Git；普通构建保留回退图形。使用同款字体需取得适用于自己站点的授权，不应复制原作者的字体或托管凭据。
  **Commercial fonts:** Novecento webfonts are excluded from Git; normal builds retain fallback graphics. Obtain a license for your own site before using these fonts; do not copy upstream font files or hosting credentials.
- **PWA：** 正式部署使用 HTTPS。离线包缓存应用资源，不预缓存千篇全文；首次下载仍取决于部署环境能否访问论文来源。见 [PWA 说明](docs/PWA.md)。
  **PWA:** use HTTPS in production. The offline package caches app assets, not all paper PDFs. Initial downloads depend on access to the publication sources. See the [PWA guide](docs/PWA.md).

## 操作说明 / Controls

### 阵列与论文库 / Archive & paper library

| 操作 / Input | 效果 / Action |
| --- | --- |
| `Enter` / `Esc` / `ENTER SYSTEM`，开场中 / during boot | 资源就绪后进入阵列 / Enter the array once assets are ready |
| `←` / `→` | 横向切换类别 / Switch categories horizontally |
| `↑` / `↓` | 纵向切换同类论文 / Switch papers vertically within the category |
| 普通滚轮 / Vertical wheel | 切换同类论文 / Browse papers in the category |
| 横向滚动或 `Shift` + 滚轮 / Horizontal scroll or `Shift` + wheel | 切换类别 / Switch categories |
| 触摸横拖／纵拖 / Horizontal / vertical touch gesture | 切类别／切论文 / Switch category / paper |
| 鼠标左键长按拖动 / Hold left mouse button and drag | 自由拖动三维阵列，可中途转向 / Freely pan the 3D array, including turns |
| `Enter` / `ACCESS FILE` / 文件编号 / file number | 打开详情 / Open details |
| `/` / `ARCHIVE INDEX` | 打开检索 / Open search |
| `READ DOCUMENT` | 打开 PDF 光学阅读器 / Open the optical PDF reader |
| `SAVE` / `SAVED` | 收藏当前文档／查看收藏 / Save current document / view favorites |
| `DOWNLOAD` | 下载关联 PDF；无附件时不可用 / Download the attached PDF; unavailable without an attachment |
| `UPLOAD ARCHIVE` | 导入、编辑论文与切换库 / Import or edit papers and switch libraries |
| `Esc` | 关闭弹窗或返回上一层 / Close the overlay or return |

论文按三列分组，每列按发表时间排序，未知日期在末尾；个人导入独立归组。X-001 等编号是组内显示序号，不是论文的唯一 ID。切类别会记住各类别的选择；自由拖动按实际格位选档。期刊／会议仍保留在论文详情中。见 [导航记录](verification/PAPER-ROWS.md) 和 [鼠标拖动修复](verification/MOUSE-PAN.md)。

The built-in catalog has three category columns, ordered by publication date within each column; unknown dates come last. Personal imports form a separate group. X-001 and similar labels are display positions, not unique paper IDs. Category navigation remembers each category's selection, while free dragging follows physical cells. Venue information remains in the paper details. See [navigation notes](verification/PAPER-ROWS.md) and the [mouse pan fix](verification/MOUSE-PAN.md).

### 导入、阅读与缓存 / Import, reading & caching

1. 点击 **UPLOAD ARCHIVE**，选择 PDF，核对和补全字段，然后保存并打开。
   Click **UPLOAD ARCHIVE**, choose a PDF, review and complete its metadata, then save and open it.
2. 详情提供原文摘要、文末参考文献和实际页码阅读记录；信息区与正文区独立滚动，底部操作保持固定。
   Details show the original abstract, references from the end of the paper, and reading history with page numbers. Metadata and tab content scroll separately, with fixed bottom actions.
3. 点击 **READ DOCUMENT**，模型居中拆解后出现页面切片。悬停提起、点击阅读；可通过滚轮、滑杆、页码输入和方向键定位页面。支持有限倾转、缩放、平移、适宽、复位和暗色反相。
   Click **READ DOCUMENT** to center and disassemble the model into page slices. Hover to lift a slice and click to read. Navigate with the wheel, slider, page input, or arrow keys. The reader supports limited tilt, zoom, pan, fit to width, reset, and dark-mode inversion.
4. 阅读器内「载入 PDF」只临时替换文件；需要长期保存时使用 **UPLOAD ARCHIVE**。`Esc` 先回到切片堆叠；退出时模型重组并返回详情。
   Loading a PDF inside the reader is temporary; use **UPLOAD ARCHIVE** to keep it in the library. `Esc` first returns to the slice stack; leaving the reader reassembles the model and returns to details.

**存储边界：** 目录与 PDF 分开保存，启动不下载全部论文。文件属于当前浏览器与当前站点的 IndexedDB，不是自选磁盘目录或云同步。更换浏览器、域名或端口会使用不同存储；清除站点数据会删除缓存、个人论文及记录。只有应用离线资源和对应论文已保存后，才能离线阅读。

**Storage scope:** catalog records and PDF files are stored separately; startup does not download the entire collection. Files live in IndexedDB for the current browser and origin, not a chosen disk folder or cloud account. Changing browsers, domains, or ports uses a different store. Clearing site data removes cached files, personal papers, and records. Offline reading requires both the app assets and the specific paper to have been saved beforehand.

详细说明 / Further details: [论文库 / Library](verification/PAPER-LIBRARY.md) · [缓存 / Cache](verification/PAPER-CACHE.md) · [PDF 阅读器 / Reader](verification/PDF-READER.md) · [目录来源 / Catalog sources](verification/PAPER-CATALOG.md)

### 模型查看与画质 / Model viewer & quality

详情页的 **360° 查看文档模型** 进入独立查看器。拖动旋转、滚轮或 `+` / `−` 缩放、方向键平移、`Home` 复位；可切换清晰／磨砂玻璃、拆解六组结构并重组。它与 PDF 阅读器的有限倾转相互独立。

Open the **360° model viewer** from the details screen. Drag to orbit, use the wheel or `+` / `−` to zoom, arrows to pan, and `Home` to reset. Switch clear/frosted glass or disassemble and reassemble six component groups. This is separate from the PDF reader's limited tilt.

界面主要面向桌面和横向屏幕，按 1920 × 1080 基准适应窗口。设置中提供亮暗主题、音效与音乐独立音量、减少动态效果，以及性能／原始／高／极高画质；超级性能模式与减少动态效果独立。首次加载需要模型和字体，浏览器可能要求点击或按键后才能播放声音。

The layout primarily targets desktop and landscape screens and scales from a 1920 × 1080 baseline. Settings include light/dark themes, separate sound and music volumes, reduced motion, and performance/original/high/ultra quality presets. Super performance mode is independent of reduced motion. Initial loading includes models and fonts, and browsers may require a click or keypress before audio playback.

## 基底预览 / Upstream visual preview

以下图片来自基底 **2026-09-09** 的原档案界面，**不是最新论文界面截图**。GIF 的压缩帧率不代表实时渲染性能。更多素材及版本见 [素材说明](docs/media/README.md)。

The images below show the upstream archive UI from **2026-09-09**, **not the latest paper UI**. Compressed GIF frame rates do not represent real-time rendering performance. See [media notes](docs/media/README.md) for capture details.

![原档案阵列 / Original archive array](docs/media/archive.jpg)

| 解密与阅读 / Decryption & reading | 模型拆解 / Model disassembly |
| --- | --- |
| ![解密后的档案详情 / Decrypted archive details](docs/media/detail.jpg) | ![六组结构拆解 / Six-part disassembly](docs/media/assembly.jpg) |

<details>
<summary>查看解密与开场动图 / View decryption and boot animations</summary>

![抽取与同步解密 / Extraction and synchronized decryption](docs/media/decryption.gif)

![白底开场 / White boot sequence](docs/media/boot-motion.gif)

</details>

基底参考《明日方舟》特别映像「莱茵生命：访问」的 5–40 秒，开场从约 6.76 秒的白色画面开始；内构还参考约 41 秒及 46–51 秒。三维场景实时渲染，开场采用 DOM / SVG 与时间轴，不使用原片作为界面背景。参考视频不随仓库分发，普通运行也不需要。

Upstream is an unofficial recreation of the terminal in the Arknights special video “Rhine Lab: Access,” primarily referencing seconds 5–40, with the white boot sequence starting around 6.76 seconds and internal structure references around 41 and 46–51 seconds. The 3D scene renders in real time; boot uses DOM/SVG and a timeline rather than the original footage as a background. The reference video is not distributed or needed for normal use.

[原 PV / Reference video](https://www.bilibili.com/video/BV1rr4y1b7sz/) · [上游早期源码与 Blender 快照 / Early upstream source & Blender snapshot](https://pan.quark.cn/s/762d9ee9dfc3)

上游的 Wallpaper Engine 版本独立维护于 [LBEILC/RhineLabWallpaper](https://github.com/LBEILC/RhineLabWallpaper)，另有 [Steam 创意工坊页面](https://steamcommunity.com/sharedfiles/filedetails/?id=3799142774)。壁纸工作台、媒体集成和音乐律动不属于本论文网页的普通运行依赖；本扩展源码应从本仓库获取。

Upstream maintains its Wallpaper Engine edition separately at [LBEILC/RhineLabWallpaper](https://github.com/LBEILC/RhineLabWallpaper), with a [Steam Workshop page](https://steamcommunity.com/sharedfiles/filedetails/?id=3799142774). Its desktop workbench, media integration, and audio-reactive features are not requirements for this paper web app. Obtain this extension's source from this repository.

## 工程与验证 / Development & verification

技术栈 / Stack: **TypeScript + Three.js + Vite + PDF.js**.

| 路径 / Path | 内容 / Purpose |
| --- | --- |
| [`src/main.ts`](src/main.ts) | 页面状态、检索与交互 / UI state, search, and interaction |
| [`src/scene.ts`](src/scene.ts), [`src/archive-loop.ts`](src/archive-loop.ts) | 三维阵列与循环导航 / 3D array and looping navigation |
| [`src/paper-library.ts`](src/paper-library.ts), [`src/paper-import.ts`](src/paper-import.ts) | 论文存储与 PDF 导入 / Paper storage and PDF import |
| [`content/paper-catalog.json`](content/paper-catalog.json) | 论文下载白名单 / Paper download allowlist |
| [`server/paper-source.ts`](server/paper-source.ts), [`functions/`](functions/) | 同源论文下载 / Same-origin paper downloads |
| [`content/archives.json`](content/archives.json) | 原 40 份档案数据 / Original 40 archive records |
| [`public/assets/`](public/assets/), [`art/`](art/) | GLB、Blender 工程与建模脚本 / GLBs, Blender projects, and modeling scripts |
| [`scripts/`](scripts/), [`verification/`](verification/) | 检查脚本、复现方法与已知限制 / Checks, reproduction steps, and limitations |
| [`DESIGN.md`](DESIGN.md) | 视觉、相机、材质与运动规范 / Visual, camera, material, and motion specifications |

```sh
npm run check:paper-catalog
npm run check:paper-cache
npm run check:content
npm run build
```

浏览器回归脚本包括 `scripts/check-paper-navigation.mjs` 和 `scripts/check-mouse-pan.mjs`；需另外提供 Playwright 与 Edge。源代码／数据检查不等于真实 GPU 或手机验收。输入合帧减少了拖动中间状态提交，但整体流畅度仍取决于 GPU、分辨率与画质，实测边界见 [MOUSE-PAN.md](verification/MOUSE-PAN.md)。

Browser regression scripts include `scripts/check-paper-navigation.mjs` and `scripts/check-mouse-pan.mjs`; they require Playwright and Edge separately. Source/data checks do not establish real GPU or physical-phone compatibility. Batched input reduces intermediate drag updates, but overall smoothness still depends on GPU, resolution, and quality settings. See [MOUSE-PAN.md](verification/MOUSE-PAN.md) for measurement limits.

修改原档案数据后可运行 `npm run export:archives`；开发和构建也会自动导出。修改模型时使用 `art/` 中的 Blender 工程及脚本，正常运行直接使用现成 GLB。更多说明见 [档案维护](content/README.md)。

After editing the original archive data, run `npm run export:archives`; development and build commands also regenerate exports. Model editing uses the Blender projects and scripts in `art/`, while normal use loads the shipped GLBs. See [archive maintenance](content/README.md).

## 许可与第三方资源 / License & third-party resources

本扩展保留原项目 [MIT License](LICENSE) 及 **Copyright (c) 2026 LBEILC**。原项目声明其有权授权的程序代码、建模脚本、技术文档、Blender 工程、GLB 模型、原创配乐／音效和原创图像适用 MIT；本扩展保留这些署名与许可，不将原作者身份用于代表扩展维护者。

This extension preserves the upstream [MIT License](LICENSE) and **Copyright (c) 2026 LBEILC**. Upstream states that MIT covers the code, modeling scripts, technical documentation, Blender projects, GLB models, original music/sound effects, and original images that its author is entitled to license. These credits and licenses are retained; the upstream author's identity does not represent the extension maintainer.

MIT 允许使用、复制、修改和再分发，包括商业或非商业、开源或闭源用途；分发内容或其重要部分时须保留版权声明与许可证。获授权内容按原样提供，不作担保；以 [许可证全文](LICENSE) 为准。

MIT permits use, copying, modification, and redistribution, including commercial, noncommercial, open-source, and closed-source uses. Preserve the copyright notice and license when distributing the software or substantial portions of it. Licensed material is provided as-is without warranty; the [full license](LICENSE) governs.

**第三方内容不因源码公开而获得 MIT 授权：**

**Publishing this source does not place third-party content under MIT:**

- **《明日方舟》：** 相关名称、标志、设定、原 PV、原作视觉设计及原片音频采样与衍生片段归各自权利人所有；包括其在模型、界面、截图与演示文字中的呈现。本项目与官方无隶属关系，无法代替权利人授权。身份验证仅为演示状态机。
  **Arknights:** names, logos, lore, the original video and visual designs, and sampled audio and its derivatives belong to their respective rights holders, including appearances in models, UI, screenshots, and demo text. This is an unofficial project and cannot grant permission on their behalf. The authentication screen is a demo state machine.
- **模型：** 上游授权包含 `archive-cassette.glb`、`archive-assembly.glb`、对应 Blender 工程及作者有权授权的衍生内容；模型中的第三方元素仍受上述排除条款约束。
  **Models:** upstream's grant includes `archive-cassette.glb`, `archive-assembly.glb`, their Blender projects, and derivatives the author may license. Third-party elements within them remain subject to the exclusions above.
- **字体：** MiSans 保留[官方许可](public/fonts/MiSans-license.pdf)与目录内版权说明；Novecento 为独立商业授权且未提交到 Git。
  **Fonts:** MiSans retains its [official license](public/fonts/MiSans-license.pdf) and accompanying notices. Novecento requires a separate commercial license and is not committed to Git.
- **依赖：** [Rolling Number](public/licenses/rolling-number.txt)、[PDF.js](public/licenses/pdfjs.txt) 及其他依赖遵循各自许可证；PDF.js 的字体和解码器也保留随包许可。
  **Dependencies:** [Rolling Number](public/licenses/rolling-number.txt), [PDF.js](public/licenses/pdfjs.txt), and other dependencies retain their own licenses, including bundled PDF.js fonts and decoders.
- **论文：** 目录引用外部论文来源；全文不随发行包分发。论文版权及下载使用条件由论文作者、出版方和来源网站决定。
  **Papers:** the catalog links to external publication sources; full texts are not bundled. Paper copyright and download/use terms remain with authors, publishers, and source sites.
- **声音：** 原项目三轨配乐为程序编配；逐字输入含原 PV 的三个 38 ms 采样，采样及衍生片段不纳入原创配乐 MIT 授权。见 [音频来源](public/audio/README.md)。
  **Audio:** upstream's three music tracks are programmatically arranged. Typing audio includes three 38 ms samples from the original video; these samples and derivatives are excluded from the original music's MIT grant. See [audio sources](public/audio/README.md).

欢迎在衍生项目中注明并链接 **[LBEILC / RhineLabUI](https://github.com/LBEILC/RhineLabUI)**。这是致谢建议，不增加 MIT 之外的强制条件，也不替代保留许可证的要求。原作者早期快照与历史部署文档用于追溯基底，不表示本扩展已获其站点、账号或第三方资源的使用授权。

Credit and a link to **[LBEILC / RhineLabUI](https://github.com/LBEILC/RhineLabUI)** are appreciated in derivative projects. This is an attribution suggestion, not an additional MIT condition or a replacement for preserving the license. Early upstream snapshots and historical deployment documents provide provenance; they do not grant this extension access to upstream sites, accounts, or third-party assets.
