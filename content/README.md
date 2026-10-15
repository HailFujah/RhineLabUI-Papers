# 修改档案内容

## 最新三行编排（2026-09-30）

精选起始目录按 `collection` 分三行：classic（代表论文100）、conference（ACL／ICML会议400，自动同步的正式会议论文追加于此）、recent（近期arXiv500）。`paper-catalog.json` 的分组由 `import-paper-catalog.py` 输出，`paper-live-catalog.json` 来自定时同步；不能从当前数组位置猜测。元数据的 venue 仍是实际会议或期刊。每行日期升序、X-NNN 重新计数，真实 ID 和 PDF 修订不变。此规则覆盖下文历史期刊分行说明；手动导入保留独立个人导入行。

## 论文目录（2026-09-30）

网页默认读取独立论文库。固定精选目录 1,000 篇，此外按年增长的 `paper-live-catalog.json` 保存自动同步的会议论文。前者配套 `paper-index.json`、`papers.json`、`paper-seeds.json` 和选取／溯源配置；同步脚本维护 live catalog、metadata index 与 provenance 三个文件。固定选集重建说明见 [首批目录](../verification/PAPER-CATALOG.md)。

新增内容沿用已有 UUID，不能拿 X-001 之类动态排序号当真实身份。仅原 PDF 内容改变时更新修订号；普通字段调整不应导致已保存 PDF 重新下载。

启动仅载入目录；首次打开才经白名单下载入口取得 PDF 并存入 IndexedDB。个人导入及用户编辑保存在本地，不回写此目录。检查命令为 `npm run check:paper-cache`，详细流程见 [论文缓存](../verification/PAPER-CACHE.md)。以下五列八份约束只用于原游戏档案。

[`archives.json`](archives.json) 是原 40 份设定档案与 TXT 导出共用的数据。修改原档案内容无需编辑 TypeScript；`src/data.ts` 同时负责原档案／个人论文库的数据切换与阵列位置映射。

## 自动同步的会议论文（2026-10-15）

GitHub Actions 每六小时同步当年目录，手动入口在 Actions → Sync conference papers。OpenReview API v2 仅保留 NeurIPS／ICML／ICLR 已将 venue ID 改为录用组的记录；ICML 官方当前卷 PMLR BibTeX/YAML 元数据补充正式出版资料；ACL／EMNLP 来自 ACL Anthology 官方 XML。暂不包括 AAAI、IJCAI，也不追补更早年份。临时来源错误会使任务失败，不会清空现有目录。

`paper-live-catalog.json` 与 `paper-live-index.json` 和原三文件并列，由 `src/paper-catalog.ts` 加载到现有 conference 类别。`paper-live-provenance.json` 记录同步时间、来源计数和总目录长度。ID 基于官方来源 ID 固定；以 DOI 和规范化标题去重。源元数据修订会更新目录，但用户浏览器 IndexedDB 中个人导入／编辑、收藏、阅读记录和已缓存 PDF 不会被任务访问。

同步结果是 Git 仓库中的 JSON 数据集，没有独立线上数据库。GitHub Action 更新提交后，网页托管平台需要重新构建／部署才会显示更新。OpenReview 和会议论文集各自决定公开时间；六小时轮询并不保证投稿后即刻可见。任务从不下载论文全文；阅读器首次请求仍经过 `server/paper-source.ts` 对 `openreview.net`、`api2.openreview.net`、`aclanthology.org` 和 PMLR 官方资产的 HTTPS 路径检查。新增来源必须明确限定主机与路径。

## 论文数据（2026-09-28）

新上传论文通过 UPLOAD ARCHIVE 进入浏览器 IndexedDB 的独立论文库，不写入 `archives.json`。论文详情使用独立的 PaperMetadata：原名、中文译名、作者数组、机构数组、发表时间、期刊／会议、研究领域、关键词、DOI、摘要、论文页面和参考文献数组。摘要直接使用 PDF 原文 Abstract，DOI 保留为导入和检索字段，详情不单独展示。论文引用指末尾参考文献，不是 BibTeX。阅读记录独立保存在本地。

[`papers.json`](papers.json) 维护原五篇真实论文元数据，不保存论文全文；历史键 X-001 只标识 Attention 的元数据条目，已不挂接游戏档案。原 40 份数据不重编号、不改分类，不将虚构人物当作者。

个人论文库按期刊分行，同一行按发表日期升序，每个期刊内显示 X-001、X-002…；持久 ID 为 `paper:UUID`，不能拿显示序号作收藏／阅读记录键。缺日期置后，期刊别名需编辑统一。日期可填 YYYY、YYYY-MM、YYYY-MM-DD。原五类、每类八份的内容校验只应用于原档案库，不能套到新论文库上。详情 DOWNLOAD 下载 PDF；历史 TXT 仍由原导出脚本维护。架构及识别限制见 [PAPER-LIBRARY.md](../verification/PAPER-LIBRARY.md)。

## 文件结构

- `categories`：检索筛选器的五个分类，按显示顺序排列。“全部档案”由界面添加，无需填写。
- `columns`：三维阵列从左到右的五个分类。与 `categories` 包含相同名称，顺序可以不同。
- `records`：四十份档案，按 `X-001` 至 `X-040` 排列。每个分类必须恰好有八份，同分类在数组中的顺序决定列内顺序。

| 字段                        | 内容                                                        |
| --------------------------- | ----------------------------------------------------------- |
| `id`                        | 稳定编号，用于收藏、定位和下载文件名                        |
| `title`、`en`               | 中文标题、英文标题                                          |
| `department`、`category`    | 科室、所属分类；分类须与上面的名称完全一致                  |
| `date`、`lead`、`clearance` | 编目范围、相关人物、访问范围；`RESTRICTED` 对应目录访问状态 |
| `abstract`                  | 摘要                                                        |
| `findings`                  | 至少一条研究记录，使用字符串数组                            |
| `source`                    | 设定参考的完整 HTTP 或 HTTPS 链接                           |

以上字段均必填，文本不能只包含空白。所有内容按纯文本显示，不支持 Markdown 或 HTML；引号按 JSON 规则写为 `\"`，换行写为 `\n`。页面会转义 HTML 特殊字符，TXT 下载保留原文。保留公开设定的来源，区分档案式改写与游戏原文。

## 修改与验证

1. 编辑 JSON 中对应档案的字段。修改分类名称时，同时更新 `categories`、`columns` 和各档案的 `category`。
2. 执行 `npm run export:archives`，校验数据并更新 `public/archives/` 中的下载文件。校验失败时不会写入任何下载文件。
3. 执行 `npm run check:content` 检查校验规则与下载一致性，再运行 `npm run build` 验证构建。将 JSON 与更新后的 TXT 一起提交。
4. 在 `npm run dev` 中查看标题、详情、检索和下载结果，尤其检查长标题与较长正文的实际布局。

`npm run dev` 启动前和 `npm run build` 构建前都会自动校验并导出。开发服务器运行期间，JSON 修改会更新页面；下载文件需再次执行 `npm run export:archives` 或重启开发服务器。

当前五列、每列八份与原片布局、循环阵列相连。校验会拒绝增减档案或改变分类数量；调整这些数量需要另行修改阵列逻辑。不要通过交换或重编号档案改变顺序，以免已有收藏指向不同内容。校验可以检查编号格式与排列，无法判断改写后是否仍是原来那份档案。

内容分离的建议来自 [@Tomahawkd 的 PR #3](https://github.com/LBEILC/RhineLabUI/pull/3)。此实现仅拆分当前项目的档案数据、校验和导出。
