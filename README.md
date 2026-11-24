<p align="center">
  <img src="assets/lsf-website-design-cover.png" alt="LSF 网站设计 Skill · 开源基础版" width="480" />
</p>

# LSF-网站设计 · 基础版

![Version 37](https://img.shields.io/badge/version-37-1d4f3d)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![作品画廊](https://img.shields.io/badge/作品画廊-lsfweb.pantoria.cn-111111)](https://lsfweb.pantoria.cn)

**给 AI 编程助手用的网页设计与工程交付技能**：让 AI 告别千篇一律的“默认模板脸”，从真实参考站侦察、交互与源码组件复用，到动画逐帧复刻与独立浏览器评审，交付真正达到上线水准的网页作品。

给它一个主题就能从零开始；再附上一个参考网址，它会先拆解原站的版式节奏、设计令牌与核心动效，再围绕你的主题重新设计并实现。也可以单独用来找设计参考、反推建站提示词、提取 `DESIGN.md` 设计规范，或评审已有页面。

**在线作品画廊**：<https://lsfweb.pantoria.cn> —— 收录多模型真实生成网站，支持按模型与模式筛选、桌面 / 平板 / 手机视口实时预览、场景长图浏览，以及参考网站与建站提示词查看。

[在线画廊](https://lsfweb.pantoria.cn) · [作品展示](#作品展示) · [核心模式](#模式与能力) · [快速安装](#安装) · [模型建议](#首版制作的模型建议) · [使用示例](#怎么用) · [工作方式](#工作方式)

---

## 为什么用 LSF-网站设计

- **先看真站再动手**：脚本自动侦察参考站 DOM、CSS 变量、字体、媒体与动效机制（WebGL / GSAP / CSS Scroll），拒绝凭印象臆造。
- **反同质化与源码复用**：内置[反套路清单](references/反套路清单.md)与开源组件源码复用核查，避免 AI 堆砌“居中大标题 + 三栏卡片 + 渐变按钮”。
- **动效逐帧复刻与核验**：支持复刻网页或录屏中的指定交互与 Three.js / Canvas / WebGL 效果，采集并逐帧对比，不以静态兜底冒充动态交付。
- **独立盲评与浏览器实测**：支持在真实浏览器（Ego Lite / Playwright）取证检查排版、无障碍、多端响应式与文案冗余。
- **一键提取 `DESIGN.md`**：内置模式 J，可从现成网站或代码库提取设计规范并生成交互预览。

---

## 作品展示

全部真实网页案例已统一收录至在线作品画廊 **<https://lsfweb.pantoria.cn>**，涵盖 Claude Opus 5.5、GPT 6 PRO、GPT-6.2 / 6.1 / 6 系列与 DeepSeek V4.1 Flash 等模型在风格参考（A）、反推提示词建站（F）等模式下的成品，提供实时交互预览、多幕场景长图、参考来源与提示词对照。

[![LSF-网站设计在线作品画廊首页](assets/showcase-gallery.jpg)](https://lsfweb.pantoria.cn)

[![作品预览工作台：多端视口切换、实时预览与提示词查看](assets/showcase-workbench.jpg)](https://lsfweb.pantoria.cn/showcase/qidou-coffee)

---

## 模式与能力

公开基础版提供 A、B、C、D、F、G、H、I、J 九种模式，AI 会根据你的指令自动选择：

| 模式 | 适用任务 |
|---|---|
| A 风格参考（默认） | 给定参考与新主题，制作完整网站 |
| B 参考创作 | 只迁移参考中的适用设计方法，形成新表达 |
| C 原创探索 | 探索原创产品定位与三种构图方向 |
| D 寻找参考 | 查找并对比至少五个真实网站参考 |
| F 反推提示词 | 派反推子 Agent 忠实反推多级（L1+L2）基准提示词与分层生图方案；支持按主题/配色由改写子 Agent 联动改写，并可选择仅交提示词或按提示词生图建站 |
| G 视觉评审 | 通过浏览器实测对已有页面独立取证和评审 |
| H 文案评审 | 检查成品页面的文案冗余与表达清晰度 |
| I 复刻动画 | 复刻指定动画、交互或录屏片段，并逐帧对照 |
| [J DESIGN.md](references/design-md.md) | 从项目或网址提取设计规范，按需生成七章交互 HTML 预览 |

兼容调用名 `lsf-web-*` 保留可用，生成独立入口的方法见[脚本说明](scripts/README.md)。子代理、模型、生图和浏览器能力由你使用的 AI 工具提供，选用 API 时使用自己的凭据。

---

## 安装

可以直接把下面这段指令交给支持本地 skill 的 AI 助手：

```text
从 https://github.com/leishifu666/lsf-website-design 安装 lsf-website-design。
保留目录结构；如果已有安装或本地定制，先检查，不要直接覆盖。
按 references/首次安装与依赖.md 检查配套组件。
```

也可以克隆到 AI 工具的技能目录，文件夹命名为 `lsf-website-design`。例如使用 `~/.agents/skills` 的环境：

```bash
git clone https://github.com/leishifu666/lsf-website-design.git ~/.agents/skills/lsf-website-design
```

Windows 可使用 `%USERPROFILE%\.agents\skills\lsf-website-design`，具体路径以 AI 工具配置为准。安装时请保留 `SKILL.md` 和完整目录结构，安装后按宿主提示刷新技能列表或开启新会话。

### 首次安装的三个必备免费组件

首次安装时，AI 助手会按[首次安装与依赖](references/首次安装与依赖.md)检查以下三项；如有缺项，会提供链接并在你授权后协助安装，同时保留已有本地定制：

- [lsf-ai-agent skill](https://github.com/leishifu666/lsf-ai-agent)：多模型调度
- [ego-browser skill](https://github.com/citrolabs/ego-lite/tree/main/skills/ego-browser)：浏览器操作规则
- [Ego Lite 浏览器](https://lite.ego.app/)：真实浏览器，安装后通常自动加入 `ego-browser` skill

三者本身免费；模型服务的账号、额度和订阅按各自平台规则使用。

---

## 首版制作的模型建议

以下是雷师傅给出的首版制作建议，实际可用型号和入口以你使用的平台为准：

| 方案 | 模型 | 说明 |
|---|---|---|
| 推荐首选 | **Claude Opus 5.5、GPT 6 Ultra、GPT 6 Pro** | 推荐用来制作网站的第一版 |
| 平替方案 | **DeepSeek V4.1 Flash** | 可用于真实项目试做，实测成品见[在线作品画廊](https://lsfweb.pantoria.cn) |
| 待测方案 | **Kimi K3.1** | 雷师傅尚未测试，欢迎测试后提交案例，帮助完善仓库 |

欢迎通过 Issue 或 PR 分享 **Kimi K3.1** 的实测案例：请提供实际入口、模型名称、技能版本、任务和参考网址，并附成品链接/截图及可复现记录（如有耗时和用量数据可一并附上，提交前请移除密钥和账号凭据）。

---

## 怎么用

在支持 `$skill-name` 的宿主中指定 `$lsf-website-design`；其他宿主可直接要求读取本技能的 `SKILL.md`。

**参考网站制作整站（模式 A）**

```text
使用 $lsf-website-design，参考 https://example.com 的设计，为长沙制作一个城市展示网站。
主题、图片、文案和交互按长沙重新组织，在当前项目实现并验证。
```

**只做视觉与交互评审（模式 G）**

```text
使用 $lsf-website-design，评审这个已有页面的视觉效果和交互，本次只评审，不改代码。
```

**反推基准提示词或提示词复刻网站（模式 F）**

```text
使用 $lsf-web-prompt，分析这个参考网站（含一级栏目和二级详情页）并先反推完整基准建站提示词；再按我的新主题与配色定向改写提示词，并由你自建或派构建子 Agent 生图落地整站。
```

如果只需要反推提示词本身，可改为：

```text
使用 $lsf-web-prompt，分析这个参考网站（含 L1 与 L2 页面）并反推完整基准建站提示词与分层生图方案，本次只交付提示词，不写网站代码。
```

**复刻一段动画（模式 I）**

```text
使用 $lsf-web-animate，把参考页的首屏滚动转场做进当前项目，采集原效果并逐帧对照。
```

**提取或生成设计系统（模式 J）**

```text
使用 $lsf-web-design-md，从当前项目或指定网址提取配色、字体与组件状态，生成并校验 DESIGN.md。
```

---

## 工作方式

AI 助手按 [SKILL.md](SKILL.md) 中的规则判断任务。普通建站默认走 **A 模式**，贴近参考风格，统一任务模板见[风格参考统一提示词](templates/风格参考统一提示词.md)：

1. **先看参考站**：实际操作原站并检查六类交互，确认主要页面的布局、点击和滚动表现，自动判断核心动效与对应源码；静态站不强塞 WebGL（见[原站侦察命令](references/原站侦察与回放.md)）。
2. **做一段能操作的样板**：默认由当前 AI 助手制作一套；仅在明确需要多方案对比时，使用同一提示词、主题和参考站做三个预览。
3. **对上参考后做完整网站**：样板核对通过后再展开全站素材与文案，每个完整网页至少复用 5 项真实源码组件（与核心场景分开验收），三阶段命令与验收标准见[取证格式](references/A模式证据格式.md)。

模式 A 制作整站时，若参考页有核心动效，会联动[动画取证与逐帧对照流程](references/动画取证与逐帧对照.md)完成样段和最终核对；只做局部动画或视频片段时直接进入[模式 I](references/复刻动画.md)。C 模式探索三个原创方向，按你指定的范围交付。

新图默认由当前 AI 助手的内置工具生成，也可按需使用外部 API，透明素材交付前会检查真实 Alpha 通道。视觉评审优先使用 Gemini 或 Claude，并在真实浏览器里检查渲染结果。

---

## 按需读取与维护

从[模式与阶段导航](references/模式阅读导航.md)查找当前任务所需资料，或通过[总索引](INDEX.md)检索全部文档。查询 A 模式预览阶段需读取的资料：

```bash
node scripts/read-plan.mjs --mode A --stage preview
```

维护 `references/资源路由.json` 或专题源文件后，更新并校验资源索引：

```bash
node scripts/resource-index.mjs
node scripts/resource-index.mjs --check
```

兼容入口通过 `install-mode-entries.mjs` 生成。脚本依赖、运行方法和回归测试命令见[脚本说明](scripts/README.md)。回归测试覆盖脚本行为，外部网站、模型和宿主能力以实际使用为准。

---

## 开源许可

本仓库的原创技能文档和脚本采用 [MIT License](LICENSE)，允许使用、修改和分发。第三方组件、字体、网站素材和商标遵循各自许可；画廊与作品截图仅用于展示输出效果，不代表其素材另行授予 MIT 许可。
