// 安装 LSF 的 Codex Stop 钩子。用法：node install-hooks.mjs [--project <项目目录>]
// 不带 --project：写到 ~/.codex/hooks.json（全局）；带：写到 <项目>/.codex/hooks.json（只对这个项目）。
// 已有的 hooks.json 会合并，不会覆盖别的钩子。装完在 Codex 里输入 /hooks，审核并信任这个钩子（Codex 规定新钩子要先信任才会运行）。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
const i = process.argv.indexOf('--project');
const base = i > -1 ? join(resolve(process.argv[i + 1]), '.codex') : join(process.env.CODEX_HOME || join(homedir(), '.codex'));
mkdirSync(base, { recursive: true });
const f = join(base, 'hooks.json');
const gate = join(dirname(fileURLToPath(import.meta.url)), 'lsf-stop-gate.mjs');
const cfg = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
cfg.hooks ??= {}; cfg.hooks.Stop ??= [];
const cmd = `node "${gate}"`;
if (!cfg.hooks.Stop.some(g => (g.hooks || []).some(h => h.command === cmd))) cfg.hooks.Stop.push({ hooks: [{ type: 'command', command: cmd, timeout: 120 }] });
const pcmd = `node "${join(dirname(gate), 'lsf-prompt-hook.mjs')}"`; cfg.hooks.UserPromptSubmit ??= [];
if (!cfg.hooks.UserPromptSubmit.some(g => (g.hooks || []).some(h => h.command === pcmd))) cfg.hooks.UserPromptSubmit.push({ hooks: [{ type: 'command', command: pcmd, timeout: 10 }] });
writeFileSync(f, JSON.stringify(cfg, null, 2));
console.log(`已写入 ${f}。下一步：在 Codex 里输入 /hooks，信任这两个钩子（Stop 和 UserPromptSubmit）。提到做网站/页面时会自动开启门槛；说“关掉 LSF 门槛”可关闭。`);
