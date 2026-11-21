# 固定上游与本地差异

- 来源：[NiazMorshed2007/reanimate](https://github.com/NiazMorshed2007/reanimate)
- 固定提交：`3f7a55a2986a84ca2173e86ee9127eefe31d046d`
- 原路径：`skills/reanimate/{SKILL.md,scripts,references}`；根目录 `LICENSE` 一并保留。
- 授权：MIT，Copyright (c) 2026 Niaz Morshed。依赖各自遵守其许可证；安装产物不随本技能分发。
- 本地入口：`node <lsf-website-design>/scripts/animation-tool.mjs`。保留的上游 `SKILL.md` 是来源资料，不覆盖 LSF 的任务范围、用户授权和工作流规则。

## 逐项差异

| 文件 | 修改原因 |
| --- | --- |
| `scripts/lib.ts` | Windows 使用 `ffmpeg.exe`；支持显式 `FFMPEG_PATH`；子进程隐藏窗口；缺依赖指向 Node 入口。 |
| `scripts/capture.ts` | `pathToFileURL` 修复 Windows 盘符、空格和中文本地文件；复用已有 Chrome/Edge 与代理；显式 SwiftShader 软件模式；增加逐帧 `frame-state.json`；真实录制按实测输入与观察窗口抽帧；在帮助及元数据中说明采样边界。虚拟采样、GPU 和资产算法沿用上游。 |
| `scripts/sheet.ts` | 复用同一 Chrome/代理配置，保证 Windows 可生成联系表。 |
| `scripts/gl.ts` | Node 22 的 main-module 检测兼容；报告增加自动判定范围提示，比较算法未改。 |
| `scripts/platform.mjs`（新增） | 查找已有浏览器、读取进程环境代理。没有浏览器时明确报错，不隐式下载安装。 |
| `scripts/package.json` | 将四项直接依赖精确固定为上游 `bun.lock` 中的版本。 |
| `scripts/package-lock.json`（新增） | npm 的可重现局部安装锁。原 `bun.lock` 保留供来源追溯。 |
| `.gitignore`（新增） | 排除依赖、浏览器缓存、运行日志与证据目录。 |

`scripts/inpage/clock.js` 和 `scripts/inpage/gl-hooks.js` 原样保留。上游的 `frames.ts`、`compare.ts`、`easing.ts` 与参考资料原样保留。

LSF 层新增 `scripts/animation-tool.mjs`、`scripts/lib/animation-runtime.mjs`、`scripts/tests/animation-runtime.test.mjs`：提供 Node 命令分发、显式局部 setup、依赖诊断、拒绝覆写非空输出目录和 CLI 回归检查。入口参数透传上游，实际选项请运行各命令 `--help`。`setup` 不需要 Bash，不安装全局 Bun，不修改 PATH、系统代理或用户配置；只在本进程给子命令补充 Node 可执行目录。`setup --browser` 才下载浏览器，普通 `setup` 安装 npm 依赖、Playwright 的视频编码器及平台辅助工具（Windows 的 Winldd）。

## 证据边界

- 原文关于“每次完全相同”“零噪声”“所有 uniform”的宣传不构成 LSF 保证。跨机器、GPU、浏览器版本、异步资源、worker、视频和合成线程都可能影响结果；须重复源采样测噪声，列出未覆盖项。
- 虚拟采样的 `frame-state.json` 关联 `frames.json`，记录零基 `frameId`、实际文件名、截图请求/完成的 Unix 毫秒、截图前 DOM 的 `performance.now()`、`scrollX/Y`、当前文档 URL 和 `clockMode`。这证明截图前观察到的页面状态，不保证浏览器合成线程在同一时刻完成呈现。
- 真实视频抽帧只能近似对应最近的 DOM 样本，条目为 `estimated: true`；精确逐图滚动坐标、页面时间、文档 URL、截图时刻为 `null`，近似值仅放在 `estimatedTrackSample`，不能冒充逐图实测。
- 真实时钟会将输入执行与输入结束后的观察期都纳入抽帧窗口。请求时长保存在 `capture.json.duration`，`realTiming` 中的页创建、输入起止和观察截止为宿主 Unix 毫秒。`frames.json` 保留估计的预录和视频起点、传给 FFmpeg 的窗口长度，以及按帧数和视频抽样率计算的抽帧时长。视频与宿主墙钟的起点可能有偏移，检查首尾画面和中间关键帧。触发前如仍处于加载态，按实测调整 `--wait-before`，必要时从完整 `video.webm` 重新选取抽帧窗口。
- `compare` 检查像素和活动曲线，不读取滚动轨迹。退出 0 仅表示报告生成成功，须读取 `report.json` 的 `pass`、`setupWarnings` 与逐帧差异；动效保真不以文字/颜色像素差硬判失败。
- `gl compare` 的退出状态只来自参与比较的非 clock 动画通道；canvas 和 draw structure 只是诊断表。clock 通道跳过、零有效通道也能退出 0，不能声称整场景等价。
- `easing` 是拟合与差值报告，没有自动通过门槛。依赖声明、着色器、固定 uniform、纹理/模型与通道需结合取证检查。
- 虚拟滚轮使用真实 `mouse.wheel` 输入但禁用平滑滚动，以防合成线程真实时钟干扰；保留惯性、停顿、反向手感还需真实时钟复核。
- 不收集 Cookie/会话文件，不绕过鉴权；公开前端资源的技术可读性不代表获得复制或再分发权利。

## 本机验证

本机使用 Windows、Node 24.11.0、现有 Chrome 与 ANGLE/SwiftShader。显式 `setup` 安装了局部依赖和录制辅助工具，随后 `doctor` 返回 `ready: true`。`doctor` 检查本地文件、依赖和编码器，报告明确标记 `launchVerified: false`。浏览器启动和 GPU 采样由实际录制验证。

用户项目的 `work/v35-runtime-test/verification.json` 汇总了两轮本地 WebGL 与 DOM 夹具实测。每轮 21 个命令的退出状态均符合预期，包含 `capture`、`frames`、`compare`、`sheet`、`easing` 与 `gl summary/channels/compare`。两轮原始 `results.json` 保留了夹具断言失败，分别源于将虚拟时间基点当成绝对零，以及将零噪声设为必需。复核使用原有的 2% 像素门槛和 80 ms 时序门槛，并核对实际帧文件和原始报告。

- 每轮重复源均比较 17 帧，平均像素差 0.00% 与 0.09%，活动时序误差均为 0 ms，实际参与比较的 1 个非 clock 通道均通过。第二轮单帧最大差 1.46%。
- 0.5 倍速夹具在两轮均被检出，平均像素差 18.15% 与 18.17%，活动结束均晚 600 ms。第二轮 `uProgress` 平均差为参考范围的 30.3%，结束晚 600 ms，GL 比较返回 1。
- `frames` 从虚拟录制的 MP4 提取 17 帧。真实时钟录制生成 640 × 360、25 fps 的 WebM，两轮各提取 14 帧，逐帧 DOM 对齐标为估算。虚拟滚动两轮均观察到 0 → 900 px，逐帧轨迹有差异。
- 同时核对了顶点及片元着色器输出、脚本和着色器资产、DOM 和 uniform 的缓动差异、含中文及空格的 Windows 本地路径、已有证据覆写拒绝和缺少 FFmpeg 的错误。已查看第二轮源联系表、半速对照图、重复差异帧和真实视频抽帧。

本机夹具覆盖 WebGL 1 和 DOM 动画。硬件 GPU、WebGPU、worker、跨平台运行和其他浏览器版本仍需各自实测。

真实滚动窗口回归见用户项目 `work/v35-runtime-test/real-scroll-window/`。相同的 1200 ms 六步滚动、200 ms 后续观察和 10 fps 设置下，旧版抽出 2 帧，最后一帧仅到 100 px；修复版抽出 18 帧并到 600 px，记录的输入耗时 1594 ms、输入结束后观察 215 ms。另一次设置 1200 ms 预录，27 帧联系表呈现 0 → 600 px；真实视频对齐依然是估算。

Shopify 原站的旧版真实采样用于排查。30.64 s 完整录屏在 18.0 s 的抽样仍是加载态，18.5 s 的抽样开始出现人物画面。最早抽出的 18 帧只覆盖加载态，轨迹显示从输入开始到 800 px 实际花了约 18.1 s。完整录屏和 2 fps 联系表留在用户项目 `work/v35-shopify-source/`。
