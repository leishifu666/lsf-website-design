import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { browserOptions } from '../../vendor/reanimate/scripts/platform.mjs';

export const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const vendorRoot = join(skillRoot, 'vendor/reanimate');
export const scriptsRoot = join(vendorRoot, 'scripts');
export const commands = ['capture', 'frames', 'compare', 'sheet', 'easing', 'gl'];
const localRequire = createRequire(join(scriptsRoot, 'package.json'));

export function flag(args, name) {
  // Match upstream's last-value-wins parser, including --key=value.
  let value;
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith(`--${name}=`)) value = args[i].slice(name.length + 3);
    else if (args[i] === `--${name}`) value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
  }
  return value;
}

export function assertFreshOutput(command, args) {
  if (flag(args, 'help') || (command === 'frames' && flag(args, 'probe'))) return;
  const output = flag(args, 'out');
  if (output === undefined) return;
  if (typeof output !== 'string' || !output.trim()) throw new Error('--out requires a path.');
  if (command === 'easing') throw new Error('easing writes JSON to stdout; it does not support --out. Redirect stdout to a new file.');
  if (command === 'gl' && args[0] !== 'compare') throw new Error('gl summary/channels write to stdout; --out is only supported by gl compare.');
  const path = resolve(output);
  if (!existsSync(path)) return;
  if (command === 'gl' || !statSync(path).isDirectory() || readdirSync(path).length) {
    throw new Error(`Refusing to overwrite existing output: ${path}. Choose a new round directory/file.`);
  }
}

export function runtime(env = process.env, version = process.versions.node) {
  const [major, minor] = version.split('.').map(Number);
  if (major >= 24 || (major === 22 && minor >= 18)) return process.execPath;
  const bun = env.BUN_PATH;
  if (bun && existsSync(bun)) return bun;
  const probe = spawnSync('bun', ['--version'], { encoding: 'utf8', windowsHide: true });
  if (probe.status === 0) return 'bun';
  throw new Error('Use Node >=24 (recommended) or Node 22.18+, or set BUN_PATH to an existing Bun executable. No global runtime is installed automatically.');
}

export function environment(env = process.env) {
  // Keep browser downloads and npm executable lookup local to this process.
  return { ...env, PATH: `${dirname(process.execPath)}${delimiter}${env.PATH || env.Path || ''}`,
    PLAYWRIGHT_BROWSERS_PATH: env.PLAYWRIGHT_BROWSERS_PATH || join(vendorRoot, '.cache/ms-playwright') };
}

export function packageAvailable(name) {
  try { localRequire.resolve(name); return true; } catch { return false; }
}

export function ffmpegExecutable(env = process.env) {
  return env.FFMPEG_PATH || join(scriptsRoot, 'node_modules/ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
}

export function prerequisites(command, args, env = process.env) {
  runtime(env);
  const packages = command === 'capture' ? ['playwright', 'pngjs'] : command === 'sheet' ? ['playwright'] : command === 'compare' ? ['pixelmatch', 'pngjs'] : [];
  const missing = packages.filter(name => !packageAvailable(name));
  if (missing.length) throw new Error(`Missing local dependencies: ${missing.join(', ')}. Run node <skill>/scripts/animation-tool.mjs setup.`);
  const needsFfmpeg = command === 'frames' || (command === 'capture' && !flag(args, 'no-video'));
  if (needsFfmpeg && !existsSync(ffmpegExecutable(env))) throw new Error('Missing ffmpeg. Run animation-tool.mjs setup, or set FFMPEG_PATH.');
  if (packages.includes('playwright')) browserOptions(localRequire('playwright').chromium, env);
  if (command === 'capture' && !flag(args, 'no-video') && flag(args, 'clock') !== 'virtual') {
    const cache = env.PLAYWRIGHT_BROWSERS_PATH;
    const encoder = cache && existsSync(cache) && readdirSync(cache).some(x => /^ffmpeg-/.test(x) && existsSync(join(cache, x, process.platform === 'win32' ? 'ffmpeg-win64.exe' : process.platform === 'darwin' ? 'ffmpeg-mac' : 'ffmpeg-linux')));
    if (!encoder) throw new Error('Playwright real-clock video encoder is missing. Explicitly run animation-tool.mjs setup (installs the local ffmpeg helper, no browser unless --browser).');
  }
}

export function doctor(env = environment()) {
  const checks = [];
  try { checks.push({ name: 'runtime', ok: true, executable: runtime(env), node: process.versions.node }); }
  catch (e) { checks.push({ name: 'runtime', ok: false, error: e.message }); }
  for (const name of ['playwright', 'pngjs', 'pixelmatch']) checks.push({ name, ok: packageAvailable(name) });
  const ffmpeg = ffmpegExecutable(env);
  const probe = existsSync(ffmpeg) ? spawnSync(ffmpeg, ['-version'], { encoding: 'utf8', windowsHide: true, timeout: 10000 }) : null;
  checks.push({ name: 'ffmpeg', ok: probe?.status === 0, path: ffmpeg, version: probe?.stdout?.split('\n')[0] });
  try { const opts = browserOptions(localRequire('playwright').chromium, env); checks.push({ name: 'browser', ok: true, executable: opts.executablePath, proxyConfigured: !!opts.proxy, launchVerified: false }); }
  catch (e) { checks.push({ name: 'browser', ok: false, error: e.code === 'MODULE_NOT_FOUND' ? 'Install local Playwright with setup.' : e.message }); }
  try { prerequisites('capture', [], env); checks.push({ name: 'realClockEncoder', ok: true }); }
  catch (e) { checks.push({ name: 'realClockEncoder', ok: false, error: e.message }); }
  return { ready: checks.every(c => c.ok), upstream: '3f7a55a2986a84ca2173e86ee9127eefe31d046d', checks, note: 'doctor checks files and encoder; it does not claim browser launch or GPU capture passed. setup is explicit and local.' };
}

function npmCli(env) {
  const candidates = [env.npm_execpath, join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    ...(env.APPDATA ? [join(env.APPDATA, 'npm/node_modules/npm/bin/npm-cli.js')] : [])].filter(Boolean);
  try { candidates.push(localRequire.resolve('npm/bin/npm-cli.js')); } catch {}
  const found = candidates.find(p => /\.(?:m?js|cjs)$/.test(p) && existsSync(p));
  if (!found) throw new Error('npm CLI not found. Install Node with npm or run npm ci in vendor/reanimate/scripts, then playwright install ffmpeg with PLAYWRIGHT_BROWSERS_PATH set to vendor/reanimate/.cache/ms-playwright.');
  return found;
}

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, { stdio: 'inherit', windowsHide: true, ...options });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`Command interrupted: ${result.signal}`);
  return result.status ?? 1;
}

export function setup(args, env = environment()) {
  if (args.some(x => x !== '--browser')) throw new Error('setup supports only --browser (optional Chromium download); npm/proxy settings can be supplied through environment variables.');
  runtime(env);
  const installEnv = { ...env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' };
  const proxy = env.LSF_PROXY || env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy;
  if (proxy) Object.assign(installEnv, { HTTPS_PROXY: proxy, HTTP_PROXY: proxy, npm_config_proxy: proxy, npm_config_https_proxy: proxy });
  let code = run(process.execPath, [npmCli(env), existsSync(join(scriptsRoot, 'package-lock.json')) ? 'ci' : 'install', '--no-audit', '--no-fund'], { cwd: scriptsRoot, env: installEnv });
  if (code) return code;
  // Playwright's video recorder needs its own small ffmpeg helper even with system Chrome.
  code = run(process.execPath, [join(scriptsRoot, 'node_modules/playwright/cli.js'), 'install', ...(args.includes('--browser') ? ['chromium', 'ffmpeg'] : ['ffmpeg'])], { cwd: scriptsRoot, env: installEnv });
  if (code) return code;
  const report = doctor(env);
  console.log(JSON.stringify(report, null, 2));
  return report.ready ? 0 : 1;
}

export function upstreamHelp(command) {
  const source = readFileSync(join(scriptsRoot, `${command}.ts`), 'utf8');
  const match = source.match(/const HELP = `([\s\S]*?)`;/);
  if (!match) throw new Error(`No help in upstream ${command}.ts`);
  return match[1].replaceAll(`bun ${command}.ts`, `node <skill>/scripts/animation-tool.mjs ${command}`).trim();
}

export function execute(command, args) {
  assertFreshOutput(command, args);
  const env = environment();
  prerequisites(command, args, env);
  return run(runtime(env), [join(scriptsRoot, `${command}.ts`), ...args], { env });
}
