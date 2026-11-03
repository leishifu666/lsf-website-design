# 网站设计技能总索引

<!-- lsf-website-design:generated-resource-index -->

先从[主入口](SKILL.md)判断任务，再用[模式与阶段导航](references/模式阅读导航.md)选择当前资料。本页只负责查找，不要求一次加载所有文件。

维护入口：`references/资源路由.json`管理模式、阶段、专题和拆分映射；专题源文件可直接编辑，生成的总索引、阅读导航及旧文件索引运行 `node scripts/resource-index.mjs` 更新，用 `--check` 校验。大体量数据按条件查询，不把整个组件库或方法库塞进提示词。

制作、文案审核、视觉评审、反推提示词有独立边界。`examples/`是历史证据；`scripts/tests/`是合成回归测试；二者不覆盖当前用户要求。

## 入口与说明

| 文件 | 用途或阅读时机 |
|---|---|
| [INDEX.md](INDEX.md) | 全部资源的可点击总索引；不是加载清单 |
| [README.md](README.md) | 安装和使用说明；首次安装才触发依赖引导 |
| [SKILL.md](SKILL.md) | 常驻总入口：自动路由、共享边界和索引 |

## 按需资料

| 文件 | 用途或阅读时机 |
|---|---|
| [references/A模式证据格式.md](references/A模式证据格式.md) | 主参考的状态、素材与机制取证；A 模式的原站锁定、可运行样段与整站对照 |
| [references/GSAP动效联动与审查.md](references/GSAP动效联动与审查.md) | 场景动效、参数和逐项落地 |
| [references/component-bookmarks.json](references/component-bookmarks.json) | 组件来源数据；按所选站点读取，不整份注入上下文 |
| [references/design-review-policy.json](references/design-review-policy.json) | 评分、预算、渠道及按制作模式选取评审资料的唯一配置 |
| [references/unslop-审查法.md](references/unslop-审查法.md) | unslop 评审专用适配 |
| [references/workflow-defaults.json](references/workflow-defaults.json) | 现有文案入口与工作流偏好；按需读取 |
| [references/三方向预览与确认.md](references/三方向预览与确认.md) | A可选三预览同提示词、同主题、同参考；C原创探索按范围执行 |
| [references/五站调研与记忆点.md](references/五站调研与记忆点.md) | 实际五站研究与产品记忆点 |
| [references/交互动效.md](references/交互动效.md) | 场景动效、参数和逐项落地 |
| [references/产品参考与复用来源.md](references/产品参考与复用来源.md) | 原创产品候选、方法筛选与种子；有趣动效、模型、鼠标交互与实际开源组件；组件来源、源码与许可证；按所选网站查询数据 |
| [references/从零型与找参考.md](references/从零型与找参考.md) | 先找站或原创路径边界；只读对应C/D小节 |
| [references/以人为中心的交互设计.md](references/以人为中心的交互设计.md) | 可发现入口、反馈、恢复和直接操作 |
| [references/关联技能.md](references/关联技能.md) | Gemini候选与独立审核；成品审核另读page模式 |
| [references/制作流程.md](references/制作流程.md) | 制作任务的范围与共享约束 |
| [references/制作约定.md](references/制作约定.md) | 制作任务的范围与共享约束 |
| [references/前卫设计与前端技巧.md](references/前卫设计与前端技巧.md) | 前卫设计与前端技巧 |
| [references/动态输入回放.md](references/动态输入回放.md) | 两侧动态输入回放 |
| [references/原创构图方法库.md](references/原创构图方法库.md) | 原创产品候选、方法筛选与种子 |
| [references/原站侦察与回放.md](references/原站侦察与回放.md) | A高精度风格参考、统一提示词与直接制作/可选预览分流；主参考的状态、素材与机制取证 |
| [references/参考取证与组件规格.md](references/参考取证与组件规格.md) | 主参考的状态、素材与机制取证 |
| [references/参考网站反推提示词.md](references/参考网站反推提示词.md) | F只反推提示词与素材方案 |
| [references/反套路清单.md](references/反套路清单.md) | 反套路清单（AI 生成感 / 行业平均值） |
| [references/命令入口.json](references/命令入口.json) | 对应功能的配置或实现；见脚本说明 |
| [references/图标与插画.md](references/图标与插画.md) | 只用开源图标库；SVG立体示意的适用边界 |
| [references/外部视觉评审.md](references/外部视觉评审.md) | 独立视觉评审的派发、证据、来源和预算 |
| [references/审查规则索引.md](references/审查规则索引.md) | 审查规则索引 |
| [references/工具清单.md](references/工具清单.md) | 工具清单 |
| [references/拆解方法.md](references/拆解方法.md) | 参考创作与既有网站的拆解方法 |
| [references/排版细节.md](references/排版细节.md) | 文字断行、光学对齐、间距与层级 |
| [references/文案审核.md](references/文案审核.md) | 文案审核：资料、规则、试跑 |
| [references/方法论库.md](references/方法论库.md) | 方法论库（知名方法论 · 按流程步骤取用） |
| [references/模式与入口.md](references/模式与入口.md) | 自动判断任务与基础版模式 |
| [references/模式阅读导航.md](references/模式阅读导航.md) | 按模式和当前阶段选读；由资源路由生成 |
| [references/正式制作与核验.md](references/正式制作与核验.md) | 正式实现的素材、技术与源码要求；最终核验、脚本边界与如实交付 |
| [references/氛围图片.md](references/氛围图片.md) | 内置生图、透明素材、固定提示词结尾 |
| [references/滚动叙事.md](references/滚动叙事.md) | 滚动叙事、分镜、pin与进度驱动 |
| [references/特殊渲染.md](references/特殊渲染.md) | 正式实现的素材、技术与源码要求 |
| [references/独立评审入口.md](references/独立评审入口.md) | 独立视觉评审的派发、证据、来源和预算 |
| [references/组件书签与源码复用.md](references/组件书签与源码复用.md) | 正式实现的素材、技术与源码要求；组件来源、源码与许可证；按所选网站查询数据 |
| [references/组件网站源码核查.md](references/组件网站源码核查.md) | 组件网站与源码核查（2026-10-19） |
| [references/自动化与门槛.md](references/自动化与门槛.md) | 最终核验、脚本边界与如实交付 |
| [references/获奖级品质标准.md](references/获奖级品质标准.md) | 获奖级品质标准（Awwwards / Webby / FWA） |
| [references/视觉评审浏览器取证.md](references/视觉评审浏览器取证.md) | 独立视觉评审的派发、证据、来源和预算 |
| [references/设计原则库.md](references/设计原则库.md) | 设计原则库 |
| [references/设计探索与交付.md](references/设计探索与交付.md) | 设计探索与交付 |
| [references/评审共用约束.md](references/评审共用约束.md) | 视觉评审共用约束 |
| [references/评审适用范围.md](references/评审适用范围.md) | 按制作模式选择评审口径 |
| [references/资料索引.md](references/资料索引.md) | 保留的原有专题资料、来源与章节指引 |
| [references/资源路由.json](references/资源路由.json) | 模式、阶段、专题和拆分文件映射的维护源 |
| [references/趣味动效与交互选型.md](references/趣味动效与交互选型.md) | 有趣动效、模型、鼠标交互与实际开源组件 |
| [references/风格还原.md](references/风格还原.md) | 风格还原：让 AI 按参考站的真实数值做，不瞎编（模式A） |
| [references/首次安装与依赖.md](references/首次安装与依赖.md) | 仅首次安装交接的三个免费组件 |

## 拆分专题源文件

| 文件 | 用途或阅读时机 |
|---|---|
| [references/topics/copy/00-使用边界.md](references/topics/copy/00-使用边界.md) | Gemini候选与独立审核；成品审核另读page模式 |
| [references/topics/copy/01-规则与来源.md](references/topics/copy/01-规则与来源.md) | 文案资料来源；引用原文或核对出处时读取 |
| [references/topics/copy/02-候选审核.md](references/topics/copy/02-候选审核.md) | Gemini候选与独立审核；成品审核另读page模式 |
| [references/topics/copy/03-历史案例与建议.md](references/topics/copy/03-历史案例与建议.md) | 文案审核：历史案例与建议 |
| [references/topics/copy/04-成品页面.md](references/topics/copy/04-成品页面.md) | 成品页面冗余审核；文字与模块分别判断 |
| [references/topics/frontend/00-使用边界.md](references/topics/frontend/00-使用边界.md) | 原生交互与内容状态；材质表面、图片边缘、圆角与滚动边界 |
| [references/topics/frontend/01-平台能力.md](references/topics/frontend/01-平台能力.md) | 前卫设计与前端技巧：平台能力 |
| [references/topics/frontend/02-工程参考.md](references/topics/frontend/02-工程参考.md) | 前卫设计与前端技巧：工程参考 |
| [references/topics/frontend/03-原生交互.md](references/topics/frontend/03-原生交互.md) | 原生交互与内容状态 |
| [references/topics/frontend/04-视觉细节.md](references/topics/frontend/04-视觉细节.md) | 材质表面、图片边缘、圆角与滚动边界 |
| [references/topics/motion/00-使用边界.md](references/topics/motion/00-使用边界.md) | 场景动效、参数和逐项落地 |
| [references/topics/motion/01-原则与参数.md](references/topics/motion/01-原则与参数.md) | 交互动效：原则与参数 |
| [references/topics/motion/02-组件与落地.md](references/topics/motion/02-组件与落地.md) | 交互动效：组件与落地 |
| [references/topics/motion/03-状态与转场.md](references/topics/motion/03-状态与转场.md) | 导航、开场、页面切换与状态过渡 |
| [references/topics/motion/04-操作与工程.md](references/topics/motion/04-操作与工程.md) | 滚动手感、拖拽、弹簧和打断 |
| [references/topics/motion/05-状态与细节.md](references/topics/motion/05-状态与细节.md) | 滚动手感、拖拽、弹簧和打断 |

## 角色与模板

| 文件 | 用途或阅读时机 |
|---|---|
| [agents/copy-reviewer.toml](agents/copy-reviewer.toml) | 成品页面冗余审核；文字与模块分别判断 |
| [agents/design-reviewer.toml](agents/design-reviewer.toml) | 对应功能的配置或实现；见脚本说明 |
| [agents/openai.yaml](agents/openai.yaml) | 对应功能的配置或实现；见脚本说明 |
| [agents/website-prompt-reverser.md](agents/website-prompt-reverser.md) | 角色：参考网站反推建站提示词专家 |
| [agents/website-prompt-reverser.toml](agents/website-prompt-reverser.toml) | 对应功能的配置或实现；见脚本说明 |
| [templates/behavior-replay.example.json](templates/behavior-replay.example.json) | 对应任务的模板；采用时再读取 |
| [templates/codex-hooks/hooks.json](templates/codex-hooks/hooks.json) | 对应任务的模板；采用时再读取 |
| [templates/motion-tokens.css](templates/motion-tokens.css) | 对应任务的模板；采用时再读取 |
| [templates/reference-spec.json](templates/reference-spec.json) | 对应任务的模板；采用时再读取 |
| [templates/review-rules.example.json](templates/review-rules.example.json) | 对应任务的模板；采用时再读取 |
| [templates/反推任务输入.md](templates/反推任务输入.md) | 反推任务输入 |
| [templates/拆解报告模板.md](templates/拆解报告模板.md) | 拆解报告：〔网站名〕 |
| [templates/独立评审固定提示词.md](templates/独立评审固定提示词.md) | 独立视觉评审固定提示词 |
| [templates/组件还原规格模板.md](templates/组件还原规格模板.md) | <组件名> 还原规格 |
| [templates/网站制作提示词.md](templates/网站制作提示词.md) | 网站制作提示词：{{项目名}} |
| [templates/评审评分表.md](templates/评审评分表.md) | 设计美感评审表（100分） |
| [templates/轮次记录模板.md](templates/轮次记录模板.md) | 本批修改记录（rounds/round-NN/changes.md） |
| [templates/风格参考统一提示词.md](templates/风格参考统一提示词.md) | 用户确认的A制作提示词；原文复用，三预览逐字相同；含Shopify填写案例 |

## 方法数据与案例

| 文件 | 用途或阅读时机 |
|---|---|
| [examples/1B脚本实测记录.md](examples/1B脚本实测记录.md) | 模式A 脚本实测记录（2026-10-19） |
| [examples/screenshots/manifest.json](examples/screenshots/manifest.json) | 对应功能的配置或实现；见脚本说明 |
| [examples/作品展示.md](examples/作品展示.md) | 作品展示与截图来源 |
| [examples/试跑案例.md](examples/试跑案例.md) | 试跑案例：咖啡豆订阅品牌官网（模式B 参考型，参考 linear.app） |
| [library/original-directions.json](library/original-directions.json) | C原创构图方法；按行业与真实资源条件筛选 |
| [library/product-reference-seeds.json](library/product-reference-seeds.json) | 按条件筛选的方法数据；不整份加载 |

## 脚本与测试

| 文件 | 用途或阅读时机 |
|---|---|
| [scripts/README.md](scripts/README.md) | 脚本命令、依赖和验证范围的详细用法 |
| [scripts/audit-a11y.mjs](scripts/audit-a11y.mjs) | 对应功能的配置或实现；见脚本说明 |
| [scripts/capture.mjs](scripts/capture.mjs) | 对应功能的配置或实现；见脚本说明 |
| [scripts/check-alignment.mjs](scripts/check-alignment.mjs) | 对应功能的配置或实现；见脚本说明 |
| [scripts/check-alpha.mjs](scripts/check-alpha.mjs) | 对应功能的配置或实现；见脚本说明 |
| [scripts/check-copy.mjs](scripts/check-copy.mjs) | 对应功能的配置或实现；见脚本说明 |
| [scripts/check-icons.mjs](scripts/check-icons.mjs) | 对应功能的配置或实现；见脚本说明 |
| [scripts/check-samples.mjs](scripts/check-samples.mjs) | 对应功能的配置或实现；见脚本说明 |
| [scripts/check-text-wrap.mjs](scripts/check-text-wrap.mjs) | 对应功能的配置或实现；见脚本说明 |
| [scripts/check-tokens.mjs](scripts/check-tokens.mjs) | 对应功能的配置或实现；见脚本说明 |
| [scripts/check-transitions.mjs](scripts/check-transitions.mjs) | 对应功能的配置或实现；见脚本说明 |
| [scripts/codex-config.example.toml](scripts/codex-config.example.toml) | 对应功能的配置或实现；见脚本说明 |
| [scripts/draw-original.mjs](scripts/draw-original.mjs) | C方向筛选；首批三版或按反馈补充，不覆盖已有输出 |
| [scripts/extract-components.mjs](scripts/extract-components.mjs) | 对应功能的配置或实现；见脚本说明 |
| [scripts/extract-media.mjs](scripts/extract-media.mjs) | 对应功能的配置或实现；见脚本说明 |
| [scripts/extract-motion.mjs](scripts/extract-motion.mjs) | 对应功能的配置或实现；见脚本说明 |
| [scripts/extract-tokens.mjs](scripts/extract-tokens.mjs) | 对应功能的配置或实现；见脚本说明 |
| [scripts/gemini-copy.mjs](scripts/gemini-copy.mjs) | 对应功能的配置或实现；见脚本说明 |
| [scripts/gen-tokens.mjs](scripts/gen-tokens.mjs) | 对应功能的配置或实现；见脚本说明 |
| [scripts/inspect-gltf.py](scripts/inspect-gltf.py) | 对应功能的配置或实现；见脚本说明 |
| [scripts/install-hooks.mjs](scripts/install-hooks.mjs) | 对应功能的配置或实现；见脚本说明 |
| [scripts/install-mode-entries.mjs](scripts/install-mode-entries.mjs) | 对应功能的配置或实现；见脚本说明 |
| [scripts/lib/a-prototype.mjs](scripts/lib/a-prototype.mjs) | 脚本内部实现；维护对应功能时读取 |
| [scripts/lib/a-reference.mjs](scripts/lib/a-reference.mjs) | 脚本内部实现；维护对应功能时读取 |
| [scripts/lib/browser.mjs](scripts/lib/browser.mjs) | 脚本内部实现；维护对应功能时读取 |
| [scripts/lib/copy-necessity.mjs](scripts/lib/copy-necessity.mjs) | 脚本内部实现；维护对应功能时读取 |
| [scripts/lib/ego-visual-evidence.mjs](scripts/lib/ego-visual-evidence.mjs) | 脚本内部实现；维护对应功能时读取 |
| [scripts/lib/replay-plan.mjs](scripts/lib/replay-plan.mjs) | 脚本内部实现；维护对应功能时读取 |
| [scripts/lib/replay-recorder.mjs](scripts/lib/replay-recorder.mjs) | 脚本内部实现；维护对应功能时读取 |
| [scripts/lib/resources.mjs](scripts/lib/resources.mjs) | 脚本内部实现；维护对应功能时读取 |
| [scripts/lib/review-workflow.mjs](scripts/lib/review-workflow.mjs) | 脚本内部实现；维护对应功能时读取 |
| [scripts/lib/scout-document.mjs](scripts/lib/scout-document.mjs) | 脚本内部实现；维护对应功能时读取 |
| [scripts/lib/section-layout.mjs](scripts/lib/section-layout.mjs) | 脚本内部实现；维护对应功能时读取 |
| [scripts/lib/source-survey.mjs](scripts/lib/source-survey.mjs) | 脚本内部实现；维护对应功能时读取 |
| [scripts/lib/spec.mjs](scripts/lib/spec.mjs) | 脚本内部实现；维护对应功能时读取 |
| [scripts/lib/values.mjs](scripts/lib/values.mjs) | 脚本内部实现；维护对应功能时读取 |
| [scripts/lighthouserc.json](scripts/lighthouserc.json) | 对应功能的配置或实现；见脚本说明 |
| [scripts/lsf-prompt-hook.mjs](scripts/lsf-prompt-hook.mjs) | 对应功能的配置或实现；见脚本说明 |
| [scripts/lsf-stop-gate.mjs](scripts/lsf-stop-gate.mjs) | 对应功能的配置或实现；见脚本说明 |
| [scripts/package.json](scripts/package.json) | 对应功能的配置或实现；见脚本说明 |
| [scripts/playwright.config.mjs](scripts/playwright.config.mjs) | 对应功能的配置或实现；见脚本说明 |
| [scripts/process-image.mjs](scripts/process-image.mjs) | 对应功能的配置或实现；见脚本说明 |
| [scripts/read-plan.mjs](scripts/read-plan.mjs) | 只查询模式/阶段读取清单，不执行页面工作 |
| [scripts/replay-behavior.mjs](scripts/replay-behavior.mjs) | 对应功能的配置或实现；见脚本说明 |
| [scripts/resource-index.mjs](scripts/resource-index.mjs) | 从资源路由与真实文件生成总索引、阅读导航和专题兼容索引 |
| [scripts/review-policy.mjs](scripts/review-policy.mjs) | 对应功能的配置或实现；见脚本说明 |
| [scripts/review-round.mjs](scripts/review-round.mjs) | 对应功能的配置或实现；见脚本说明 |
| [scripts/round-report.mjs](scripts/round-report.mjs) | 对应功能的配置或实现；见脚本说明 |
| [scripts/scout-reference.mjs](scripts/scout-reference.mjs) | 对应功能的配置或实现；见脚本说明 |
| [scripts/spec-draft.mjs](scripts/spec-draft.mjs) | 对应功能的配置或实现；见脚本说明 |
| [scripts/start-reference.mjs](scripts/start-reference.mjs) | 对应功能的配置或实现；见脚本说明 |
| [scripts/tests/a-lifecycle.test.mjs](scripts/tests/a-lifecycle.test.mjs) | 修改对应实现后运行的回归测试 |
| [scripts/tests/a-prototype.test.mjs](scripts/tests/a-prototype.test.mjs) | 修改对应实现后运行的回归测试 |
| [scripts/tests/basic-edition.test.mjs](scripts/tests/basic-edition.test.mjs) | 修改对应实现后运行的回归测试 |
| [scripts/tests/design-gate.spec.mjs](scripts/tests/design-gate.spec.mjs) | 修改对应实现后运行的回归测试 |
| [scripts/tests/fixtures/a-prototype.mjs](scripts/tests/fixtures/a-prototype.mjs) | 修改对应实现后运行的回归测试 |
| [scripts/tests/fixtures/source-survey.mjs](scripts/tests/fixtures/source-survey.mjs) | 修改对应实现后运行的回归测试 |
| [scripts/tests/original-directions.test.mjs](scripts/tests/original-directions.test.mjs) | 修改对应实现后运行的回归测试 |
| [scripts/tests/replay-behavior.test.mjs](scripts/tests/replay-behavior.test.mjs) | 修改对应实现后运行的回归测试 |
| [scripts/tests/resources.test.mjs](scripts/tests/resources.test.mjs) | 修改对应实现后运行的回归测试 |
| [scripts/tests/review-workflow.test.mjs](scripts/tests/review-workflow.test.mjs) | 修改对应实现后运行的回归测试 |
| [scripts/tests/scout-reference.test.mjs](scripts/tests/scout-reference.test.mjs) | 修改对应实现后运行的回归测试 |
| [scripts/tests/source-survey.test.mjs](scripts/tests/source-survey.test.mjs) | 修改对应实现后运行的回归测试 |
| [scripts/workflow-check.mjs](scripts/workflow-check.mjs) | 对应功能的配置或实现；见脚本说明 |
