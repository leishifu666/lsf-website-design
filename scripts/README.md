# scripts 使用说明

脚本基于 Playwright（Node 18+），`check-alpha.mjs` 无依赖。

## 脚本和评审的分工
- 默认两次真实独立调用、一批集中修改。首审通过就结束；按需定向复核，到限如实闭合，命令见[自动化与门槛](../references/自动化与门槛.md)。
- Agent独立给分；脚本校验口径、证据、预算并机械合成维度，不自行审美加分。工程检查另列，不按Lighthouse等分数删动画。
- 宿主优先，exec兜底；二者同一台账，不为验证入口而重复评审同一网站。失败/超时也占用额度。
- 新流程节点测试：`node --test tests/review-workflow.test.mjs`；不调用外部模型，不冒充真实评审质量验证。

## 安装（一次）
```bash
cd scripts
npm install
npx playwright install chromium ffmpeg   # ffmpeg 用于滚动录屏；装不上时 extract-motion 自动跳过录屏
```
Playwright 自带浏览器下载失败时，设 `CHROME_PATH=/path/to/chrome` 用本机 Chrome/Chromium（所有脚本和 `npm run gate` 都读这个变量）。需要走代理时设 `LSF_PROXY` 或 `HTTPS_PROXY`，脚本会把账号密码交给浏览器。

## 1. 多尺寸截图
```bash
node capture.mjs https://example.com ./out
```
输出：`375-fold.png` `375-full.png` `768-fold.png` `768-full.png` `1440-fold.png` `1440-full.png`。
脚本会先慢速滚动到底，触发懒加载图片和滚动动画，再截图。
用在：步骤2 拆解取证；步骤8 开发后验收。

## 2. 提取实测设计令牌
```bash
node extract-tokens.mjs https://example.com ./out 1440
node extract-tokens.mjs https://example.com ./out-m 375   # 再跑一次移动端
```
输出：`tokens.json`，包含按出现次数排序的前 15 个值：字体、字号、字重、行高、字距、文字色、背景色、渐变、margin、padding、gap、圆角、阴影、边框、过渡动画、网格列数、最大宽度，以及 `:root` 上的 CSS 变量（同域样式表才读得到）。
怎么读：出现次数最多的几个字号/间距通常就是对方的阶梯；`cssVariables` 有值时往往直接就是设计令牌。
用在：步骤2 第3层（布局）、第4层（视觉）。

## 3. 可访问性扫描
```bash
node audit-a11y.mjs https://example.com ./out
```
输出：`a11y.json` 与终端摘要表。只跑 WCAG 2.0 / 2.1 的 A 与 AA 规则。
用在：步骤8 验收。

## 注意
- 有登录墙、强反爬或 Cookie 弹窗的网站，截图可能被遮挡，需要手动关闭弹窗后用 DevTools 截图。
- 结果是“某一时刻、某一视口”的快照，写报告时标注日期和视口。
- 这些脚本只取证，不做判断；“为什么”仍然要人（或 AI）按 `../references/拆解方法.md` 去写。

## 4. 按用户要求运行的工程检查
`npm run gate`检查axe、示例图和截图回归；`npm run lhci`测工程指标。仅用户明确要求工程检查时运行，不是每轮美学评分门槛，不因性能结果减少正常动效。历史基准不要改写为新口径。

## 5. 接入 Codex 的 MCP
见 `codex-config.example.toml`（未实测）。装了 Chrome DevTools MCP 后，截图和取证可以直接由 Codex 调用，本目录脚本作为兜底。

## 6. 风格还原（模式A）脚本
完整流程见 `../references/风格还原.md`。
```bash
node extract-tokens.mjs <url> ref/1440 1440          # 计算样式 + 网络里全部 CSS 源码（含 CDN）：变量、@font-face
node extract-components.mjs <url> ref/comp 1440      # 按钮 / 卡片 / 导航 / 输入框 / 标签 / 区块，按样式去重成变体 + 截图
node extract-motion.mjs <url> ref/motion 1440        # 库、ScrollTrigger/Lenis 参数、canvas/WebGL 探针、hover/按压/伪元素、真实滚轮逐帧
node spec-draft.mjs <url> ref/1440/tokens.json --motion ref/motion/motion.json > ref/reference-spec.draft.json
# 人工确认草稿 → ref/reference-spec.json
node gen-tokens.mjs ref/reference-spec.json src/styles [--strict-spacing]
node check-tokens.mjs ref/reference-spec.json src --allow src/styles/tokens.allow.json      # 静态
node check-tokens.mjs ref/reference-spec.json --url http://localhost:3000 --paths /,/about  # 运行时
```
`check-tokens` 有违规时退出码 1。项目改过 Tailwind 的 `--spacing` 时加 `--tw-spacing <px>`。

## 7. 细节检查、素材处理、轮次记录
```bash
node check-transitions.mjs <地址> out/tr 1440            # 弹窗/面板/tab/背景切换是否瞬间出现（也可量参考站的进出场参数）
node check-text-wrap.mjs <地址> --viewports 375,768,1440  # 标题、按钮里词被拆开、孤字、行首标点
node check-alignment.mjs <地址> --viewports 375,1440      # 同区块差 1～6px 没对齐，输出带辅助线的截图
node check-icons.mjs --src src / --url <地址>             # 手写 SVG、字母冒充箭头、图标/头像没对齐、列表选中项缩进
node extract-media.mjs <参考站> ref/media 1440            # 参考站图片怎么处理
node process-image.mjs key|pair|export ...               # 抠图、黑白底求透明、裁边、导出 WebP/AVIF/PNG
node round-report.mjs snap <地址> rounds/round-02   # 默认只截图
node round-report.mjs check <地址> rounds/round-02  # 确需全套细节检查时
node round-report.mjs build rounds                 # 收尾汇总一次
```
检查中文断行前，机器上要有页面用的中文字体，否则汉字不会正常排版。

## 8. 文案与独立评审入口
```bash
node install-hooks.mjs [--project <项目>]           # 装 Stop + UserPromptSubmit 钩子，然后在 Codex 里 /hooks 信任
# 默认：按 lsf-ai-agent 的 Google AI Studio 浏览器流程回收候选；不自动调用API
node gemini-copy.mjs copy/brief.json --via t8star   # 仅用户之后明确指定贞贞API时使用
node check-copy.mjs --approved copy/approved.json [--url <地址>]   # 文案可追溯到 Gemini；标题按钮结尾无标点
node review-round.mjs rounds/round-01 --root <原项目> --target target.md --fallback-reason <实际不可用原因> --model <当前模型ID>  # 独立exec兜底，共用两次预算
node workflow-check.mjs prepare-review --root <原项目> --round rounds/round-01 --target target.md # 宿主派发前登记
```

## 历史验证状态（2026-10-19，Debian arm64 Chromium 155 + Playwright 1.5x）
| 脚本 | 状态 |
|---|---|
| capture.mjs | 实测通过（本地页面） |
| audit-a11y.mjs | 实测；修了一个真 Bug：@axe-core/playwright 要求用 `browser.newContext()` 建页面，旧写法直接报错 |
| tests/design-gate.spec.mjs | 实测：axe 能拦住缺 title/lang 的页面；视觉回归第一次运行会因没有基准图而失败并生成基准，第二次起正常比对 |
| extract-tokens.mjs | 实测 linear.app：读到 117 个样式表、670 个声明变量、3 个 @font-face |
| extract-motion.mjs | 实测 linear.app、gsap.com、lenis.darkroom.engineering；修了录屏缺 ffmpeg 直接崩溃的问题 |
| extract-components.mjs | 实测 linear.app：28 个变体、9 个区块 |
| spec-draft / gen-tokens | 实测；修了阴影值被截断导致 Tailwind 编译失败的问题 |
| check-tokens.mjs | 合规页和违规页各测一次（见 `../references/风格还原.md` 验证状态） |
| check-transitions.mjs | 测试页：生硬弹窗报出、@starting-style dialog 和 opacity 面板通过、JS 直接改 body 底色报出；linear.app 上能跑通（判定为启发式，需看截图复核） |
| check-text-wrap.mjs | 测试页：「日用」被拆开报出，keep-all + wbr 版通过 |
| check-alignment.mjs | 测试页：多 3px 左边距的段落报出 |
| extract-media.mjs | apple.com/airpods-pro：80 项，识别出 34 个透明 PNG 抠图主体 |
| process-image.mjs | 合成图测试：pair 模式 alpha 误差 0/255；key 模式丢半透明（预期）。真实生图的黑白底配对未验证 |
| check-icons.mjs | 测试页 5 类问题全部报出、正确写法无误报；linear.app 0 误报 |
| extract-motion navOnScroll | 测试页“向下隐藏、向上出现”识别正确 |
| round-report.mjs | 两轮测试：报告含分数差、改动、并排截图、差异图 |
| gemini-copy.mjs | 用假的本地命令测通 cmd 模式；没有 Gemini 时报错退出（退出码 3）。真实 Gemini CLI / API 未验证 |
| check-copy.mjs | 测试页报出“早八。”结尾句号、未定稿的段落、追溯不到 Gemini 的定稿 |
| lsf-stop-gate.mjs / lsf-prompt-hook.mjs / install-hooks.mjs | 用模拟的钩子输入测通：缺评审、缺文案时返回 block，全部满足时放行，未开启时不干预。在真实 Codex 里未验证 |
| review-round.mjs | 未验证（沙箱没有 codex 命令和账号） |
| extract-motion smoothScroll 曲线 | lenis.darkroom.engineering 估算 lerp 0.121；原生滚动页判为实时 |
| lhci（Lighthouse CI） | 未验证 |
| codex-config.example.toml、agents/*.toml | 未在真实 Codex 中验证 |

## 透明底图片检查
```bash
node check-alpha.mjs ../public/images/*.png
```
输出每张图“通过 / 失败”和透明像素占比；有失败时退出码为 1。Codex 生图声称透明底的素材必须先过这一步（原因见 `references/氛围图片.md`）。

## 示例图不上线检查
```bash
node check-samples.mjs ../dist
```
别人的图（含网上别人生成的 Midjourney 图）只能在本地放进 `public/_samples/` 当示例，让用户判断风格合不合适。构建产物里出现 `_samples/` 目录、`sample-` 开头的文件或对它们的引用，就判失败。`npm run gate` 里也有同样的检查（测预览地址时，页面请求不能出现示例图）。

## v23验证边界
2026-10-31的预算/合成/证据/Hook改动以本轮Node测试结果为准。历史浏览器测试不证明新流程或原生角色加载已实测。未在此次更新中发起真实模型评审或创建网站。

## v31新增入口（2026-11-02）

- `node draw-original.mjs --brief <五站调研输入JSON> --out <新候选JSON>`：只用于C原创探索，记录种子与资源条件；候选不算真实预览。
- Ego Lite现场取证：在当前指南要求的轮次脚本中导入`lib/ego-visual-evidence.mjs`，传入已有Page和原项目的绝对证据目录；不单独用node启动浏览器。
- `node --test tests/original-directions.test.mjs tests/review-workflow.test.mjs`：候选、图标边界及原评审流程回归；不发送外部模型请求。
- 模式入口由`references/命令入口.json`和install-mode-entries.mjs生成，显示统一基础版七种模式。视觉评审优先Gemini/Claude，安装引导只在首次安装执行。

## v31渐进式披露与三版预览

命令路径以本scripts目录为基准。查询与索引命令不调用浏览器、生图或外部模型。

```bash
node read-plan.mjs --mode A --stage preview             # 仅列当前阶段需要的文件
node read-plan.mjs --mode G --stage review --design-mode A # 按参考模式列实际评审材料
node read-plan.mjs --mode C --stage build --topic scroll  # 需要时补一个专题
node resource-index.mjs                                # 更新总索引、阶段导航、三个专题兼容索引
node resource-index.mjs --check                        # 只校验生成文件是否同步
node --test tests/resources.test.mjs tests/original-directions.test.mjs tests/review-workflow.test.mjs
```

维护源是`references/资源路由.json`与`references/topics/`中的专题文件，生成的INDEX、模式阅读导航和三个旧文件索引不手改；旧章节锚点继续可用。正文迁移不把技巧变成额外门禁，历史案例与工程建议仍不覆盖当前用户偏好。

`workflow-check.mjs begin --design-mode A|B|C`记录制作模式，`prepare-review --design-mode ...`可显式指定旧项目口径；它与`--mode full|verify|comparison`是两个不同参数。缺制作模式时按目标卡核对，不默认为C。审查包保留完整项目规则正文，只减少不适用的技能材料，不改变评分或两次调用预算。

A 默认直接做一段并延续为整站，明确比较时才做三个预览；C 原创探索首批做三个高质量关键片段；具体分工和确认见`references/三方向预览与确认.md`。C的输入可用`exclude_methods`排除已否定方法、`allow_methods`限定适用池、`count: 1..3`按反馈补方案；首批默认3，后续输出必须是新文件。16项方法与28个产品线索不代表已经完成预览或实际站点研究。

### A 模式侦察与逐块核对

新 A 从 `node start-reference.mjs <参考URL> --root <原项目> --site <网站目录>` 进入。它实际打开浏览器并生成可继续补充的源台账。深入单个区块用 `scout-reference.mjs`，实际输入用 `replay-behavior.mjs`；两侧使用同一回放计划。操作和输出详见[侦察指南](../references/原站侦察与回放.md)。

### A 模式证据核对

在原项目 `begin --design-mode A` 后，`workflow-check.mjs reference-check --root <项目> --stage source` 核验并锁定原站实测。完成可操作样段后运行 `--stage prototype`；通过可展开整站，交付前运行 `--stage paired`，再走既有 prepare-review 与 check。证据字段与主题资产复用见 [取证格式](../references/A模式证据格式.md)。模式入口支持 `node scripts/install-mode-entries.mjs --mode A` 只刷新 A 的生成文件。
