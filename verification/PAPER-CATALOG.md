# AI 论文首批目录

更新：2026-09-30。已导入 **1,000 篇**，包含原五篇；新增 995 篇。原 40 份游戏档案保留。

## 范围与实际分布

| 选取范围 | 数量 | 规则 |
| --- | ---: | --- |
| 代表论文 | 100 | 原五篇＋95 篇人工选择的 arXiv 论文；标题、作者和摘要以实际 API 返回值核对 |
| ACL 2025 Long Papers | 200 | 从带作者和摘要的官方卷目录均匀取样 |
| ICML 2025 / PMLR 267 | 200 | 从官方整卷 citeproc 元数据均匀取样 |
| 近期 arXiv | 500 | cs.AI、cs.CL、cs.CV、cs.LG、cs.RO 五类按首次提交倒序交错取样；截至 2026-09-29 |

这是一份可复现的入门选集，不是引用排名、完整会议录或全量 AI 数据库。会议样本按整卷位置分散选取，不表示获奖或推荐。arXiv 分类映射为研究领域，不伪造作者关键词。预印本检索范围从 2025-01-01 开始，实际最新的 500 条来自接口返回的截止日前记录。

当前阵列有六行：ACL 200、ICML 200、NeurIPS 3、NAACL-HLT 1、CVPR 1、**预印本／待确认 595**。最后一行指本批仅核对了 arXiv 来源，尚未系统核对正式发表去向；其中有后来正式发表的代表论文，不能据此声称它们都未被接收。API 的 journal-ref 保留在字段 `journalReference`，不把自由文本直接当作期刊行名。后续可通过正式论文来源核实后归类。

arXiv 显示首次提交日期，并在详情日期后标注“首次提交”；ACL 日期精度为 2025-07；ICML 沿用 PMLR 的出版日期 2025-10-06，不伪造会议开幕日为逐篇发表日。机构只取来源明确给出的 affiliation，作者姓名与 affiliation 分开解析；缺失机构、译名、关键词留空。

## 来源、重现与维护

- [arXiv API](https://info.arxiv.org/help/api/user-manual.html)：Atom 记录、作者、分类、摘要、首次提交日期、版本及外部 DOI。
- [ACL Anthology 官方数据](https://github.com/acl-org/acl-anthology/blob/master/data/xml/2025.acl.xml)：ACL 2025 原文 XML。
- [PMLR 267 官方 citeproc](https://proceedings.mlr.press/v267/assets/bib/citeproc.yaml)：ICML 2025 批量元数据及官方 PDF 地址。
- 原五篇正式版本的来源及 PDF 检查见 [PAPER-CACHE.md](PAPER-CACHE.md)。五篇原文摘要复用此前真实 PDF 的核对结果。

`content/paper-selection.json` 固定截止日、候选 ID 和名额；`paper-seeds.json` 固定原五篇 ID／PDF／修订号；`papers.json` 仍只维护五篇人工核对字段。新增记录在 `paper-index.json`，合并后的下载白名单在 `paper-catalog.json`。

`paper-provenance.json` 记录本批请求 URL、实际获取时间、响应 SHA-256、重复跳过记录、数量和分类。原始响应只在 Git 忽略的 `verification/fixtures/paper-ingest/`。公开目录的论文摘要和第三方元数据不因此转为本项目原创或 MIT 授权内容。

维护机使用 Python 3.11+ 与 `scripts/paper-ingest-requirements.txt` 的 PyYAML；网页运行和部署不需要 Python：

```sh
python -m pip install -r scripts/paper-ingest-requirements.txt
python scripts/import-paper-catalog.py --fetch
# 原始缓存齐全时离线重现；缺缓存报错，不隐式联网
python scripts/import-paper-catalog.py
npm run check:paper-catalog
npm run check:paper-cache
```

请求串行、间隔至少 3.2 秒，每个响应有大小和超时上限。`--fetch` 仅补齐缺失的元数据响应，不访问 PDF。没有启动时爬取、每日定时任务或偷偷刷新已缓存 PDF。这个脚本构建固定首批快照；未来增量同步仍需单独实现游标、撤稿／版本变更与人工审核。修改截止日或候选集是明确的目录维护操作，不能称为已完成自动持续收录。

去重顺序为来源稳定 ID、完整标准化标题、非空 DOI；arXiv 去掉版本号后认定同一论文。新 UUID v5 从来源 ID 确定生成，复跑稳定；已有五篇 UUID 不变。同标题即跳过，可能保守合并同名的不同文章；标题变化且没有共同标识的跨来源版本仍可能漏合并，不宣称完全的学术实体消歧。

## 运行时与空间预算

- 目录描述及含摘要的索引采用独立异步模块，只在进入论文库时加载。构建后两份模块 gzip 合计约 641 kB；元数据仍整体进内存，尚非数据库级分页。
- 详情直接显示元数据中的原文摘要。点击 READ DOCUMENT、DOWNLOAD 或需要从全文提取的“论文引用”时，才走已有首次下载／本地缓存链路。
- arXiv PDF URL 固定到本批返回的 `vN`，修订号稳定。刷新网页不探测新版本。原五篇正式版 PDF URL 与修订号不变。
- ARCHIVE INDEX／SAVED 每页最多 40 行，UPLOAD ARCHIVE 每批 30 行；全库参与检索，支持 arXiv ID、DOI、领域、作者、标题和关键词。期刊筛选横向可滚动。
- 每个期刊一物理行，同行从早到晚，各行独立 X-001 起编。未改场景、摄像机、模型数量和 PDF 纹理预算；收藏、PDF 和阅读历史仍绑定 `paper:UUID`。
- 保留手动字段编辑和浏览器内原文件。没有整库 PDF 预下载，也没有改变本地缓存的持久性边界。

## 验证记录与边界

- `check:paper-catalog` 通过：1,000 个唯一稳定 ID／slug／元数据键、原五篇描述完全保留、标题和外部 ID 去重、原文摘要非空、日期范围、来源和数量、ACL 作者机构分离。
- `check:paper-cache` 8 项通过：v1 迁移、目录无 Blob、原档案保留、排序、并发下载、离线复读、取消、错误和版本变化；使用生产模块＋Node fake-indexeddb，不是浏览器验证。
- 前端和 Functions TypeScript、Vite 构建通过。独立索引及原有主包仍触发 >500 kB chunk 提示；本批约 2.13 MiB 未压缩目录／摘要模块，已与启动主包拆分。
- 最终 PWA / Cloudflare 包：`17c118b24d783a2b`，1,024 个离线资源、41.0 MiB，发行目录 1,032 文件，授权字体校验通过。只构建打包，不表示已部署到正式域名。
- 官方元数据缓存离线重放后，三个生成文件 SHA-256 逐一一致；未发网络请求，也未下载 PDF。
- `http://127.0.0.1:5173/?scene=detail` HTTP 200。下载接口实取 Word2Vec（arxiv-1301-3781，228,716 字节）、ACL 2025 long.1（673,497 字节）、ICML a-mancisidor25a（4,591,517 字节），三者均 HTTP 200 / application/pdf，包含 PDF 头与 EOF。这只是三源抽样，不是千篇逐一 PDF 验收。
- GPT-3（arxiv-2005-14165）第一次 HTTP 抽样在传输中断，Node 报 `TypeError: terminated` / `UND_ERR_SOCKET: other side closed`，连接已收约 931,438 字节；未取得完整 PDF，不能标记此项通过。原因尚未确定；原链路的超时、错误重试及“不缓存截断文件”规则保留。
- 浏览器新会话调用 `cua.createBrowserTab("iab", "http://127.0.0.1:5173/?scene=detail", { visible: true })` 仍在访问授权阶段返回 `saved browser permissions could not be verified`。没有 HTTP 状态码；console、截图、WebGL 未开始。完整错误与分类沿用 [PAPER-CACHE.md](PAPER-CACHE.md) 的 Browser Use 权限服务记录。
- 浏览器待验：千篇检索翻页及期刊筛选的明暗／小屏布局、源站首开保存、断网复读、快速切换及 GPU 视觉。构建或 Node 检查不能替代这些项目。
