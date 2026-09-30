# 论文目录与原 PDF 本地缓存

更新：2026-09-29。覆盖此前“原档案 X-001 关联技术样例、每次从 URL 打开”的实现。

## 原逻辑与本轮替换

| 环节 | 原逻辑 | 当前论文逻辑 |
| --- | --- | --- |
| 数据 | `archives.json` 固定五类 40 份 | 保留原库；默认独立论文库，记住切库选择 |
| 分类／位置 | 游戏分类列、列内档案 | 每行期刊，同一行不同列按发表时间升序 |
| 身份 | X-001 等稳定游戏编号 | `paper:UUID` 稳定身份；X-NNN 仅当前排序号 |
| 文件 | 原库 TXT；示例外链；导入记录内含 Blob | 目录与原 PDF 分库存储，按 ID 获取一份文件 |
| 启动 | 读取所有导入记录及其 Blob | 只读取目录／已提取文字，不读取全库 PDF |
| 再次阅读 | 示例再次打开远程 URL | 修订匹配直接读取 IndexedDB，无网络探测 |
| 详情／下载 | 分别读取 PDF URL | 摘要、引用、阅读器、DOWNLOAD 共用缓存入口 |

原游戏数据与已有收藏不删除。游戏 X-001 不再伪装成 Attention 论文。壁纸和 time/review 原片对照仍使用游戏库。当前仍在内存载入全部元数据，尚未实现大型远端目录的游标分页；已解决全库 PDF Blob 载入和目录模型重复扫描，不能将本轮称为无限规模数据库实现。

## 示例来源

| 论文 | 年份／期刊会议 | 官方 PDF 实测字节／页数 |
| --- | --- | --- |
| [Attention Is All You Need](https://papers.nips.cc/paper_files/paper/2017/hash/3f5ee243547dee91fbd053c1c4a845aa-Abstract.html) | 2017 / NeurIPS | 569,417 / 11 |
| [BERT](https://aclanthology.org/N19-1423/) | 2019-06 / NAACL-HLT | 786,279 / 16 |
| [Deep Residual Learning for Image Recognition](https://openaccess.thecvf.com/content_cvpr_2016/html/He_Deep_Residual_Learning_CVPR_2016_paper.html) | 2016 / CVPR | 603,123 / 9 |
| [Generative Adversarial Nets](https://papers.nips.cc/paper_files/paper/2014/hash/f033ed80deb0234979a61f95710dbe25-Abstract.html) | 2014 / NeurIPS | 539,761 / 9 |
| [Denoising Diffusion Probabilistic Models](https://papers.nips.cc/paper_files/paper/2020/hash/4c5bcfec8584af0d967f1ab10179ca4b-Abstract.html) | 2020 / NeurIPS | 33,025,164 / 12 |

机构按上述论文署名填写；DDPM 亦参考[作者项目页](https://hojonathanho.github.io/diffusion/)。中文译名、领域和关键词是目录编辑字段。三篇 NeurIPS 论文统一 venue 全名，在同一物理行按 GAN → Attention → DDPM 排列。Attention 选用正式会议版 11 页，不是旧技术样例的 arXiv 15 页版。

## 存储与加载

`rhine-paper-library` 数据库升为 v2。`papers` 存字段、页数、哈希、原文件名、来源修订和缓存提示；`files` 按相同 ID 存原始 Blob、哈希、修订和保存时间。升级在一个事务里迁移旧 Blob，保留原 ID 与编辑内容。没有删除收藏或阅读记录。

读取流程：

1. `archiveDocument` 定位稳定 ID 的描述，不为全库生成 Blob URL。
2. `paperFile` 读取该 ID 的文件；修订相同立即返回，无 fetch、HEAD 或过期刷新。
3. 缺失时访问同源 `/api/papers/:slug`，从目录预先记录的官方 PDF URL 下载，不爬取论文网页。
4. 流式累计文件，上限 100 MiB；检查 PDF 头部／EOF，计算 SHA-256。完整文件与缓存状态在同一事务保存，成功后才交给阅读器。首尾检查不等于验证所有 PDF 对象。
5. PDF.js 提取原文 Abstract、参考文献与页数并保存，之后不重复解析已有内容。手动摘要不覆盖。
6. 阅读器继续只保留受预算限制的缩略图及当前高清页。DOWNLOAD 从同一原文件创建短期对象 URL，用后释放。

同页并发共享一次在途读取；任一使用者取消不会打断其余使用者，全部取消才中止。支持 Web Locks 的浏览器跨标签串行同一文件并再次查库。失败响应、HTML、缺失 EOF、取消下载不标记已保存；持久化失败明确提示，不静默承诺离线可用。源修订只随明确版本变更，不能每次启动随机更新。

本地是浏览器的同源存储，域名、协议、端口不同即不同库，不是可指定的磁盘目录或跨设备同步。请求 Storage Persistence 可能不获准；清理站点数据、隐私会话结束或存储回收可能移除文件。离线阅读需先完成应用 PWA 缓存；开发服务器关闭后不能凭论文缓存加载整个网站。

## 下载入口与发行

- `server/paper-source.ts` 只允许 `paper-catalog.json` 里的 slug，不接收任意 URL；官方返回非 PDF 或错误时返回 502，未知 slug 404，声明超限 413。实际流也限制 100 MiB。
- Vite 开发／preview 中间件与 `functions/api/papers/[slug].ts` 共用上述逻辑。用户导入仍只在本地，不发给服务器。
- Cloudflare 根目录 Functions 随 Git 构建部署，`_routes.json` 只对 `/api/papers/*` 启用函数。静态托管或只上传静态包无法提供此下载服务；此时本地导入仍可使用。
- PWA 缓存 PDF.js CMap、字体、WASM、无 WASM 回退 JS 和相关许可；目录外的 PDF 不加入发行包、不预下载整库。

## 本轮检查

- 五个同源下载 GET 均 HTTP 200，字节数和 PDF 头／EOF 如表。
- `npm run check:paper-cache`：8 项通过。生产模块配合 fake-indexeddb，覆盖 v1 迁移、目录不携带 Blob、期刊排序／原 40 份保留、并发单次下载、重新载入模块后拒绝一切网络仍可读、取消、错误／截断重试、版本变更、导入编辑不丢文件、下载白名单及字节保持。
- `node scripts/check-paper-samples.mjs`：官方五篇的生产文字提取器通过 Node PDF.js 适配器解析；Abstract 均非空，识别参考文献条目 32/64/49/29/72。BERT 四位年份不再被误判为参考文献序号，并识别 Additional Details 附录边界。参考文献断行／作者拆分仍是启发式结果，可编辑，不表示逐条学术校验通过。
- TypeScript 与 Vite 生产构建通过；主包原有 >500 kB 提示仍在。未运行会改写原 40 份 TXT 的 prebuild。
- 2026-09-30 收尾：前端与 Functions 的 TypeScript 检查通过。按项目既有流程从正式站恢复四份授权字体资源并核对 SHA-256 后，重新构建 PWA 与 Cloudflare 包成功：版本 `1f335bd8428026b1`，1022 个离线资源、38.9 MiB，发行目录共 1030 个文件。字体和测试 PDF 均不进入 Git。
- Node 测试不等于真实浏览器跨标签、配额回收、Service Worker 离线启动或 GPU 视觉验收。

## 浏览器验收阻挡记录

重新调用 `mcp__cua_repl.js`：

```js
var paperTab = await cua.createBrowserTab("iab", "http://127.0.0.1:5173/?scene=detail", {visible:true});
```

完整工具错误：

```text
Browser Use could not complete this action because a browser security check was unavailable. Reason: Browser Use could not request permission. Browser use cannot access http://127.0.0.1:5173 because saved browser permissions could not be verified. Please try again later. This failure may be temporary. The agent may retry after the issue is resolved, but must not bypass browser security controls or use an indirect workaround.
```

发生在 Codex 内置浏览器新页面创建／访问授权检查，工具未给 HTTP 状态码，页面读取、JS、console、截图、WebGL 均未开始。按用户要求记录为 Browser Use 权限服务问题，不能归因于项目鉴权、CDP 或 GPU。

另一个独立问题：沙箱 Node 访问官方 PDF 返回 `fetch failed EACCES connect EACCES 165.245.153.223:443`；获准联网后官方返回 `200 application/pdf`，本地可联网 Vite 服务五篇全部成功。这是执行沙箱网络限制，与 Browser Use 权限服务问题分开记录。

浏览器权限恢复后仍需：首次打开 → 查看已存本地 → 关闭重开且屏蔽网络 → 阅读／DOWNLOAD；双标签同时首开；真实配额失败；小屏／明暗／拆组与阅读渲染。生产 Pages Function 的实际发布及域名 HTTP 验收单独记录，不以本地成功冒充线上成功。
