# PDF 光学档案阅读器

更新：2026-09-27。此记录取代早期放在 360° 查看器内部的原型。

## 入口与架构

详情页主按钮为 **READ DOCUMENT**，收藏与 EXPORT 并列。X-001 附件为明确标注的《Attention Is All You Need》技术样例，其他档案可选择本地 PDF。原 360° 查看器继续独立查看实体模型。

| 模块 | 职责 |
| --- | --- |
| archive-documents.ts | 档案与 PDF 附件关联 |
| archive-assembly.ts | 两种查看器共用六组部件及拆解深度 |
| ArchiveScene.documentPose() | 捕获详情模型实际姿态与相机投影 |
| document-viewer.ts | 状态、相机、交互、异步取消及资源生命周期 |
| pdf-document.ts | PDF.js worker、解析、受像素预算约束的栅格化 |
| pdf-layout.ts | 有限页面窗口及从左到右的空间布局 |
| pdf-slice.ts | 薄玻璃载体、真实页面、紧固件与小型竖排标识 |
| pdf-material.ts | 缩略页、投影页与高清页共同的反相材质 |

详情和文档查看器各有 WebGL 上下文；文档打开后暂停主场景。文档的拆解、显影、抽出、阅读和重组共用一个 renderer、相机与场景，复用原灯光、分辨率／纹理预算、临界阻尼、ViewerCameraMotion 和 Blender 模型。环境贴图不跨 renderer 共享。没有 iframe 或浏览器默认 PDF Viewer。

## 状态和连续过渡

    CLOSED → LOADING → EXPLODING → PROJECTING → ENTERING → PDF_OVERVIEW
    PDF_OVERVIEW → SELECTING → PDF_READING
    PDF_READING → RETURNING_PAGE → PDF_OVERVIEW
    换页：RETURNING_PAGE → SELECTING → PDF_READING
    退出：RETRACTING → REASSEMBLING → RETURNING_ARCHIVE → CLOSED
    载入错误：ERROR → 选择新文件 / 重试 / 退出

- 六组拆解沿用 5.5 临界阻尼。折射环组汇入光学核心并向基板投影；真实导航 mesh 先在基板上逐渐显影，再提取到左侧，不能在最终位置突然生成。
- 显影期间源盖板不写入遮挡透明页面的深度；页面完全显影后转为不透明墨层，进入 Three.js 玻璃折射预渲染。实际帧见 substrate-slides.png，避免只在状态名中“显影”、画面却被盖板挡住。
- 正常进入约 4.6 秒；显影、靠近基板和提取有重叠。点击切片后从当前位置抽出，高清完成后原位换纹理。换页先收回旧页再抽出新页，连续输入只执行最新目标。
- 返回档案先将切片归入基板，再使六组部件的位置和速度实际收敛，最后恢复原详情投影。减少动态效果直接进入终态。
- generation、AbortController、RenderTask 共同取消过期工作；失败的 loading task 也销毁 worker。关闭释放页面和模型资源，恢复入口焦点。

## 视觉约束

研究了本地 OS-03-P 的 sliceMotion.ts 与 SliceAtlas.tsx；最终外观按用户标注的官方 STRUCTURAL SECTION 画面调整。用户本地录屏为 14.30 秒、2560×1036；逐帧观察约 7.8–8.3 秒退页、9.6–10.6 秒进入，参考快退、缓入和落稳节奏。原片和提取帧不进入产品。

- 左侧品牌、细竖线、PDF 标识、从左上到右下的光学片；右侧阅读表面保持边界与留白。
- 合成顺序：背景 → PDF 标识 → 透明 WebGL 切片 → HUD。字符框必须在切片后方。
- 悬停仅沿队列竖直方向提起，不沿 Z 轴跨过前页；前方切片继续遮挡被提起页。不能用 renderOrder 强制置顶。
- 载体复用既有 Blender 薄盖板（原厚度约 0.032）、齐平嵌片和角部紧固件。取消厚框和大黑色横梁，真实 PDF 保持比例。
- 阅读页水平限 ±0.28 rad、竖直限 ±0.18 rad，保持正面；原模型查看器仍可 360° 旋转。
- 暗色反相实际 PDF 图文，包括缩略图、基板投影、高清页；玻璃和 HUD 使用既有主题。
- 滚轮、滑杆、方向键定位，Enter 或点击读页。阅读支持前后页、PageUp/PageDown、缩放、适宽、平移和复位。Esc 先回堆叠，再回档案。
- 放大页由三维裁剪平面限制在阅读区。文档打开时舞台使用 overflow: clip，防止焦点或点击导致外层隐式滚动。

## 性能与发行

- 最多 7 张可见切片；thumbnail 宽 340、上限 19 万像素，最多两个并发任务。保留当前 13 页范围加投影首张与阅读页，缓存上限 15。
- 只为当前页生成高清 Canvas：正常上限 400 万像素，超级性能模式 200 万；单边不超过 4096 或硬件限制。替换后立即释放旧纹理，不常驻整份 PDF 高清页面。
- PDF.js 与匹配 worker 按需加载；字体、CMap、WASM 使用同源版本目录并进入原 PWA 离线发行包，保留 PDF.js 及各资源许可。构建 PDF.js chunk 416,511 B、worker 1,232,303 B，完整发行约 35.5 MiB。
- 文档场景使用 WebGL 原生 MSAA。高画质对照发现原全帧 SMAA／OutputPass 会忽略 PDF 的逐材质 toneMapped=false，造成纸面和文字发灰；本查看器省去该后处理，保留高清内容的颜色与反相。分辨率、DPR、材质和纹理过滤仍跟随画质预算。原模型查看器和主场景的管线不变。
- 对象计数不是 GPU 显存字节实测，也不代表所有复杂 PDF 的性能保证。扫描件、密码、表单与真实 iPhone 尚未完成专项覆盖。

## 实际验证

本机 Chromium / Vite。样例：[Attention Is All You Need](https://arxiv.org/pdf/1706.03762)，15 页。50／100 页压力文件由此重复页面生成；另有旋转横页与纵页的混合文件、无效文件。全部在 Git 忽略的 verification/fixtures/，不打包第三方全文。

| 检查 | 实际结果 |
| --- | --- |
| 真实论文 | 15 页真实缩略图；点击三维页面、页码、高清和返回堆叠可用 |
| 50 页末页 | 50/50，下一页禁用；7 切片、8 thumbnail、1 高清页 |
| 100 页定位 | 末页可达；连续跳 2、50、99、1、87，最终第 87 页；7 切片、8 thumbnail、1 高清页 |
| 适宽 | 常规 903×1168；适宽 1496×1936；放大不覆盖左侧导航 |
| 混合页面 | 横页 903×697，纵页 903×1168，比例跟随真实页面 |
| 限角 | 极端拖动停在 yaw −0.28、pitch −0.18，正面仍可见 |
| 暗色与层级 | PDF 图文反相；字符框在后，中间页提起仍被前页部分遮挡 |
| 错误恢复 | 无效 PDF 显示错误；重新选择论文可继续阅读 |
| 关闭与重组 | 显示 REASSEMBLING 并实际归位；关闭页、切片、thumbnail、高清和任务计数均为 0，焦点回到 pdf-viewer |
| 原模型查看器 | 拆解与重组后恢复“已组装” |
| 低资源／减少动作 | 进入和返回直接完成，152% 缩放为 1243×1608，低于 200 万像素 |
| 响应式 | 1600×900、390×844、844×390；修正队列越界和舞台滚动。仅 Chromium 视口模拟 |
| 静态与构建 | TypeScript、生产构建通过；npm run check:pdf 覆盖 1176 个窗口及深度顺序 |

数据见 pdf-reader/results.json；画面见同目录 PNG。data-stats 每 250ms 采样，刚进入新阶段时可能仍为上一帧状态。关闭后 renderer 保留少量环境／管线纹理供复用，PDF 页面资源已释放。

复现：npm run dev → X-001 详情 → READ DOCUMENT。其他检出没有本地 fixture 时，先将论文下载为 verification/fixtures/attention-is-all-you-need.pdf，或用右上“载入 PDF”选择文件。生产样例从 arXiv 获取；网络或 CORS 失败时可用本地入口。

本轮为技术与浏览器复核；最终视觉和动效继续根据用户体验反馈调整。
