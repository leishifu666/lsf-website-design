// LSF host adapters. The upstream capture / clock / GPU algorithms are unchanged.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function chromePath(env = process.env, platform = process.platform) {
  if (env.CHROME_PATH) {
    if (!existsSync(env.CHROME_PATH)) throw new Error('CHROME_PATH does not exist; set it to an installed Chrome/Chromium executable.');
    return env.CHROME_PATH;
  }
  const candidates = platform === 'win32' ? [
    join(env.PROGRAMFILES || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe'),
    join(env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)', 'Google/Chrome/Application/chrome.exe'),
    ...(env.LOCALAPPDATA ? [join(env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe')] : []),
    join(env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe'),
  ] : platform === 'darwin' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return candidates.find(existsSync);
}

export function browserOptions(chromium, env = process.env) {
  const executablePath = chromePath(env) || (existsSync(chromium.executablePath()) ? chromium.executablePath() : undefined);
  if (!executablePath) throw new Error('No Chromium found. Set CHROME_PATH or explicitly run animation-tool.mjs setup --browser.');
  const raw = env.LSF_PROXY || env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy;
  let proxy;
  if (raw) {
    let u;
    try { u = new URL(raw); } catch { throw new Error('Invalid proxy URL in LSF_PROXY / HTTPS_PROXY / HTTP_PROXY.'); }
    proxy = { server: `${u.protocol}//${u.host}`, username: decodeURIComponent(u.username) || undefined,
      password: decodeURIComponent(u.password) || undefined, bypass: env.LSF_PROXY_BYPASS || 'localhost,127.0.0.1,[::1]' };
  }
  return { executablePath, ...(proxy ? { proxy } : {}) };
}
