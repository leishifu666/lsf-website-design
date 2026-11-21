# A 模式原站取证与成品对账

A 的验收对象是主参考的可辨识特征。先定位原站真正驱动画面的资源和行为，再把主题替换到相同位置。用户给的主参考即主线，其余调研站只作旁证。相同技术库、通用渐变、成品打分或一张首屏均不能单独证明还原。

新登记的 A 从[原站侦察与回放](原站侦察与回放.md)进入。侦察台账负责真实拓扑、六类行为、核心动效判断、区块规格与逐块结果，下面的合同复用它的实际截图、样式和文件。新流程标记 `a_reference_version: 36`；既有33/34记录保留历史，迁移方法见本页阶段命令。

## 从发现到开工

1. 在真实浏览器建立原站清单。先从进入到结束慢滚一遍，再逐一操作目录、点击、悬停、键盘、返回、倒滚、中断、恢复；拖拽、触屏或计时驱动按站点实际补。交叉检查导航目的地、公开代码中的章节/路由和网络加载的场景。**未打开的章节也进清单**。若输入被遮挡，查覆盖层、真正滚动容器、必做手势和加载条件，按原交互再试。公开代码可补机制，不把它当成访问成功。明确超出用户范围的路径单列。只有截图时只认截图能证明的部分。
2. 在相同浏览条件、实际 CSS 视口取原图。三档分别为 375、768、1440。结构相同的重复项共用测量；实质不同的布局、操作、加载、遮罩、场景和转场分别取证。动态序列按起点、中段、终点列状态，加正常退出/反向。有拖拽、骨骼、shader 或相机联动时再保留视频或连续帧和与输入同步的运行观察。注明设备倍率、缩放、滚动进度/时间、控件焦点。脚本截图失败时可用实际浏览器补证。
3. 按层找资源。查看 currentSrc、背景和伪元素、叠层、字体、视频、canvas、模型、材质、时间线和绑定。先走“找到原资产 → 看它在场景中的用途 → 决定哪些层可编辑”。可复用的自有/授权资产直接以原件为底改主题；需替换时按原层级、拓扑/枢轴、相机关系、输入映射、材质通道与转场时序作等价实现。留下原始资源 URL / bundle 定位、复用依据、目标文件以及可观察的动作结果。程序化资产可以指向实际使用的生成/渲染源码。
4. 写入站点目录的 `ref/a-reference.json` 和原站发现清单，按下节登记核心动效与源码选型。令牌沿用 `ref/reference-spec.json`，组件规格沿用既有模板，证据文件引用即可。在已有工作流中执行 `node <技能>/scripts/workflow-check.mjs reference-check --root <原项目> --stage source`。通过后制作样段；失败则保留缺口，继续取证、检索及不依赖缺口的事实整理，不展开依赖该机制的代码、生图或整站文案。重新实测导致已锁内容变化时，核对后加 `--reason <原因>`。

## 核心动效与源码选型

A 的 `source-survey.json` 保留 `version: 1`，新增 `core_motion`。这是对主参考的判断，不是技术偏好。先看正常渲染的实际操作，再填以下状态：

| status | 含义与后续 |
|---|---|
| `required` | 已观察到决定辨识度的核心动效；各项绑定behavior和资产样本，至少选一个代表核心effect做动态样段，补齐原站机制与运行读数后进入source |
| `none` | 实际检查范围内没有核心动效；理由及独立观察文件须支持该判断，按静态样段核对，不强制 WebGL |
| `unknown` | 还无法判明核心动效，先补观察；source不通过 |
| `blocked` | 正常路径、关键资源或取证受阻，记录障碍；source不通过，fallback不能代替正常路径 |

```json
{
  "core_motion": {
    "status": "required",
    "reason": "填写本次观察到的辨识度机制",
    "basis": "ref/实际观察文件.json",
    "effects": [{"id": "gate-reveal", "behavior": "gate-drag", "assets": ["gate-material"], "probe": "reveal"}]
  }
}
```

此例只说明格式，不能直接当通过证据。`basis` 指向实际操作/录屏/采集的独立观察文件，不能指回本清单。`effects[].id` 是稳定effect ID，`behavior` 对应既有 `behaviors[].id`，`assets` 引用既有 `kind: asset` 样本；无独立素材时留空数组并填 `assetsAbsent` 的实际依据。effect与behavior绑定各自唯一。只为代表样段选中的effect填 `probe`，它指向 `prototype.original` 的真实动态主场景探针，与behavior的 `prototype / sequence`、区块和资产一致。至少选一个真正核心effect，相关读数可共用样段，不能拿别的机制充数；其余核心effect在source实测、paired补成品，不要求提前把全站做进prototype。`none` 留空 `effects`，不能与已确认的标志性动态sequence或动态样段矛盾；静态canvas或静态模型本身不强制 `required`。

每个核心behavior保留已确认的 `mechanism`、前置状态和可追溯断言；`assertions` 继续用 `direct / measured / fitted / unknown`。GPU场景用 `role: "renderer"` 引用正常路径实际 `webgl / webgl2 / webgpu` 上下文，模型运动用 `role: "geometry"` 核对运行对象的几何/姿态等读数；两幕合成分别核对出场幕、进场幕及合成输出。库名、下载了GLB、找到了Theatre数据、手填“正常模式”和空探针都不能证明它们已连接或被播放。关键未知不得伪装为直接证据。

源码选型在source前完成：优先原项目同源实现、指定书签组件和有权使用的原资产/官方示例；记录具体文件、许可、使用位置与保留机制。原资产按下文 `reuse / reskin / rebuild` 使用，允许必要的新模型、shader或连接代码，前提是机制有依据且权利可说明。普通组件五项另按[源码记录](组件书签与源码复用.md#来源与运行记录)逐页核对；下载研究材料、安装依赖或组件数量均不替代核心样段。

正常路径与降级支路分别登记。降级行为可用 `behavior.variant: "fallback"` 标明，不能绑定成核心effect。实际浏览器只显示静帧时，先复核GPU、就绪条件和原站能力分支；`source` 受阻时不能自行将目标改为静态。用户明确修改范围时按其要求更新合同，并说明哪些原目标已不再纳入，不把降级伪装成原目标通过。

## 选哪个样段

在看到内页之前，先不规定每章都有主标题、副标题、按钮和大图。目录点不动时，读取真实链接的 pathname 与 hash、实际滚动容器和进入条件，再用键盘、滚动或直达地址复验。页面仍在加载的帧只说明加载态；已下载的场景代码只证明有这段实现。例如目录选择器找不到 `a[href="#online"]`，先读取实际链接：`[...document.links].filter(a => a.origin === location.origin && a.hash).map(a => [a.textContent.trim(), a.pathname, a.hash])`。按原站显示的链接打开，操作后核对章节可见标题或场景，不能只看地址栏变化。列出无法实看的状态以及实际障碍，继续处理不依赖它的事实和资源。

从原站选一段，优先选「换掉它，网站就认不出来」的操作。定位实际资产、渲染层和输入绑定，用新主题对象做这一段。现场判断可用下面的问题，只取原站实际具备的项。

| 看什么 | 原站和样段怎样对照 |
|---|---|
| 转场 | 轻滚、停在中途、再倒滚或继续。哪两幕在交接？哪个区域先显现？如果只隐去前景人物，下一幕能否在原来位置显现？记录触发式或进度式及反向行为。 |
| 文字 | 悬停、离开，或按原站方式进入与退出。看清哪些字变化、是否分组、延迟多久、是否恢复，中文按含义重新分组。一次入场模糊不能代表可逆的文字操作。 |
| 主体资产 | 先看画面最大的主角。相机运动时查轮廓变化、前后遮挡、光照和材质；判断原物是平面绘层、视频还是可绕看的模型，再决定如何复用或按原结构重建。将实际绘制尺寸与显示面积对照；使用相同库名不能证明细节相同。 |
| 版式与控件 | 进入代表章节时同时看主角尺度、标题位置、目录是否仍可用。量主次按钮和强调色，记录各层边界。观察标题下是否真的需要说明、面板或第二个入口。 |

保留原站能被识别的操作、视觉主次和空间关系。角色、题材、准确的本地文案和故事内容由新主题决定；配色按角色映射，维持前后景对比与强调面积。为一项资产决定复用、换肤或重建前，先指明它在以上关系中承担什么作用。

同一类重复章节可共享实现；独有的构图、资产绑定、输入或过渡单独落实。source通过后只做代表样段必需的资源与代码，核对所选核心机制并通过后再批量生成章节与新文案。样段可有多个探针，不要求提前实现所有effect、新增几个页面或先凑足五项组件。这个动作属于开发自查，不增加外部模型轮次。

## 文件形状

`ref/a-reference.json` 顶层字段为 `version: 1`、`source`（完整主参考 URL）、`inventory`（站点目录内的原站发现清单路径）、`states` 和 `samples`。以下是单条记录的写法，路径仅说明格式。文件必须来自这次真实取证。

- 发现清单的 `discovery` 填实际浏览/导航/资源遍历记录的站内文件路径，便于核对遗漏。其 `states` 项形如 `{"id":"gate-mid","trigger":"入口手势完成后，转场约一半","widths":[1440]}`，`samples` 项形如 `{"id":"enter-hover","kind":"control","state":"gate-ready"}`。收录所有可区分的状态和代表变体；不要把移动端确有区别的状态只登记桌面宽度。简单页面确实没有控件或资产时以 `absent.control` 或 `absent.asset` 说明所见，仍核对原站配色和表面边界。
- 发现清单的 `sequences` 逐条列标志性转场，如 `{"id":"open-gate","input":"拖动达到阈值","states":["gate-ready","gate-mid","entered"]}`。有中间过程的三态必须在同一宽度有实际画面；需要时增加倒滚、退出和打断。确实没有此类动态的站填空数组和 static_reason，无须编造动效。
- 合同 `states` 的每项用 `id`、`width` 对应清单的一态一宽，再填 `original`，完成实现后补 `built`。两边各含 `status: "observed"`、`image`、`viewport: {"width":1440,"height":900}` 和 `observation`。暂未看到的状态记 `status: "unverified"` 及实际障碍；保留缺口，不删清单。相同视口、输入、进度和焦点各拍一次。
- 合同 `samples` 按清单的 `id` 关联。每边均为 `{"values":{...},"evidence":"ref/实际测量文件.json"}`。测量文件注明选择器或画面区域、状态、视口和工具。选定字体和尺寸、布局间距等仍按工具和组件规格核对。下表值按实际读取填字符串，包括 `none`、全透明、0 与无反馈。
  
| kind | values 中填写 | 如何判读 |
|---|---|---|
| palette | foreground、background、accent | 按角色和场景采色，注明 CSS 计算值、渐变停止点或像素采样。默认沿用实测配色，跨主题改色记录逐角色映射，保持明暗、对比与强调面积。 |
| control | color、background、border、radius、padding、type、feedback | 主次按钮、图标按钮、链接等不同变体分别量。存在的默认、悬停、按下、焦点、选中或禁用态分别列样本。type 记字体、字号、行高；feedback 记形变、颜色、时长、缓动。 |
| surface | layers、boundary | 数从最外到内容的可见分组面和边界；同时看描边、阴影、底色与伪元素。原站用留白分组就保留留白。控件边线、分隔线和键盘焦点环单独标用途，别误当多余卡框。 |
| asset | resource、binding、shape、motion | 原侧 resource 记录实际 URL 或资源/代码定位，成品侧填确实运行的站内文件。binding 记状态/枢轴/层级，shape 记轮廓/比例/材质，motion 记输入、进度到行为的对应。静态资产注明静态。 |

每个资产额外写 `strategy`（reuse 原件复用、reskin 在原件上改样式、rebuild 按原结构重建）、`keep`、`change`、`rights`，锁定其保留关系、主题改动与使用依据。每项 `samples` 成品填写 `verdict: "match" | "adapted" | "drift"`。测量差异或授权/中文/无障碍/禁用 hover 适配给出 `reason` 和实际影响。资产两侧的 binding、motion 用相同术语描述可观察的关系，具体实现文件分别列在证据中。若连这些关系也改变，须记 drift；用户明确改变目标时才可用 adapted 并在 user_exception 录入对应要求。自行换整套按钮、配色、凭空加界面边框、把门的转场改成背景装饰环，均不能只凭“主题需要”通过。

## 样段记录与阶段命令（新 A 制作）

`begin` 先登记原项目。当整站已存在时，保留原稿并以登记时的文件为起点。接下来使用同一个 `--root <原项目>`。

| 命令 | 现在填什么 | 通过后才能做什么 |
|---|---|---|
| `reference-check --stage source` | 合同先填各项 `original`，source-survey包含核心判断与取证。在 `prototype.original` 写原站样段运行记录的站内路径，如 `ref/prototype-original.json`。此时不预填 `built` 路径。 | 制作样段所需的代码与资产并实测 |
| `reference-check --stage prototype` | 增加 `prototype.built`，只补所选状态和样本的 `built`。用与原站相同的起点、视口和输入复演。 | 批量写文案、做素材、展开其他章节 |
| `reference-check --stage paired` | 补齐整站两侧和每页五项源码复用；用最终运行文件重测受改动影响的样段，正常路径与fallback分开。 | 进入独立评审与最终 `check` |

两份运行记录各有一个 `probes` 数组。一项观察主场景（`role: "scene"`），一项观察标题（`"heading"`）；没有标题就在原侧 `absent_heading` 写明实测位置。探针的 `samples` 和帧的 `state` 复用同一发现清单的 ID。以下是**单条格式示例**，数字和路径应用实际页面测得的值替换。

```json
{
  "id": "reveal", "role": "scene", "width": 1440, "sequence": "open-gate",
  "samples": ["gate-material"], "locator": "https://example.org/edition#gate",
  "resource": "ref/original/gate.glb", "implementation": "ref/original/reveal.js",
  "driver": "wheel", "mapping": "continuous", "range": {"value": 600, "unit": "css-px", "tolerance": 4},
  "target": "two-scenes", "layer": "shared-mask", "property": "reveal-front",
  "frames": [
    {"state": "gate-ready", "at": 0, "value": "0px", "result": "first-only"},
    {"state": "gate-mid", "at": 0.5, "value": "310px", "result": "both-visible"},
    {"state": "entered", "at": 1, "value": "622px", "result": "second-only"}
  ]
}
```

- 两侧沿用同一操作、作用对象、图层、属性和结果短语；`value` 留各自实测读数。`at` 是该次输入的归一化进度。`range` 保留真实幅度：计时动画用毫秒，连续滚动或拖动记实际行程与单位，原侧 `tolerance` 来自测量误差。确无固定行程的连续控制用 `{"unbounded":"实际依据"}`。方向变化有独立意义时另录离开/返回操作。相同标签无法证明曲线和视觉质量，评审仍需复演。
- `mapping` 支持 `continuous`、`timed`、`discrete`、`static`。静态标题或静态构图以 `sequence: null` 和 `at: 0` 单帧记录，不要求时长。原站的瞬时开关只拍可见的前后两态，并在发现清单的对应 sequence 声明 `mapping: "discrete"`；存在中间状态就实拍。
- 原侧 `locator` 指向公开网址和具体节点或资源；`resource`、`implementation` 分别指向在站内保存的实际素材及驱动源码。普通静态页面可使用采集到的 HTML/CSS。成品侧改为运行对象或选择器、实际实现路径。成品记录顶层 `measured_files` 保存影响该样段的运行文件与素材的 SHA-256（至少含各探针的 resource、implementation）。例如在站点目录执行 `Get-FileHash -Algorithm SHA256 -LiteralPath 'src/reveal.js'`，存小写摘要。改动后先重测，再更新摘要。测量和截图供观察，不代替真实资产。
- 参考站实测改变需带 `--stage source --reason "重新实测的原因"`，原样段与整站核对随之失效。若较晚登记或已经动工，保留已有文件和旧材料，按提示用 `--stage source --existing-draft --reason "已有稿的来历"` 建立改造起点；此选项不免除source证据。旧33/34流程要继续新制作或正式核验时，用 `--stage source --upgrade --existing-draft --reason "迁移与已有稿依据"` 补新版合同。只有source成功才设版本36并使旧下游锁失效；失败保留原文件及历史锁，不倒填过去的样段，也不把旧通过称为新版通过。局部修字、修Bug不自动启动迁移。命令核验记录的先后、版本和已知文件，不能拦截所有编辑器、工具写入或部署；主Agent对实际阶段负责。

## 子任务交接与回收

沿用本次已授权的分工，不额外派构建Agent。交给取证、素材、组件或评审Agent的任务均包含：相同 effect/behavior/资产/探针ID、当前阶段与检查结果、真实前置状态和输入、已读证据文件及来源等级、未知/受阻项、文件所有权、可执行的验收条件。主Agent不要把“请做一个高级场景”替代已确认合同。

回传说明实际读取、修改和实测的文件，分别标清研究、实现和验证状态。主Agent读取产物、核对调用和真实场景，按同一输入复演关联行为，再合并台账。只有GLB分析、Theatre时间线研究或一个组件候选时，仍属研究；子Agent说完成、静态截图好看或视觉分数达标都不能越过未通过的阶段。

## 如何验收

运行样段所在的实际页面，执行 `reference-check --stage prototype`。在余下章节实现后，再用 `reference-check --stage paired` 对照整站，接着走原有独立文案、视觉评审与 `workflow-check.mjs check`。参考清单变动、未观察状态、未测按钮、缺资源、缺配对图、记录仍有偏离均须据实处理。视觉审查包冻结两侧证据；外部模型实际收到标了来源与视口的对照图，可用带标签的对照页及关键区域原尺寸裁切。模型读不到的路径或没收到的帧计为未验证。源证据叫“实测”仍需审核员核对其内容。

让独立评审把品牌名、主题标题暂时遮住，分别指出首屏构图、按钮样式和一个标志交互如何让人认出同一主参考；再看操作是否真的产生同类变化。结构校验只能发现缺件，无法代替人眼和运行判断。追查偏差：原站采错就重测；规格没错就修成品。完成标准沿用现有视觉预算。
