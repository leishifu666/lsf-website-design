#!/usr/bin/env node
import { commands, doctor, environment, execute, setup, upstreamHelp } from './lib/animation-runtime.mjs';

const help = `LSF animation tools — pinned reanimate upstream, native Windows/macOS/Linux entry.

  node <skill>/scripts/animation-tool.mjs doctor
  node <skill>/scripts/animation-tool.mjs setup [--browser]
  node <skill>/scripts/animation-tool.mjs <capture|frames|compare|sheet|easing|gl> [upstream arguments]
  node <skill>/scripts/animation-tool.mjs <command> --help

Node >=24 recommended (22.18+ or existing BUN_PATH also supported).
setup installs only skill-local npm packages, video encoder and platform helpers.
Only setup --browser downloads Chromium; existing Chrome/Edge or CHROME_PATH is reused.
FFMPEG_PATH overrides the local encoder. LSF_PROXY/HTTPS_PROXY/HTTP_PROXY are supported;
LSF_PROXY_BYPASS defaults to localhost,127.0.0.1,[::1]. No global install or system setting changes.
Existing nonempty --out directories and gl compare report files are refused. Use a new round.
compare exit 0 means report generation, NOT passing fidelity: inspect report.json pass and setupWarnings.
gl compare exit 1 means failed non-clock channel checks. Structure is diagnostic only;
zero evaluated channels can exit 0. Easing has no pass/fail exit code.
Virtual-clock evidence must be complemented with real-clock interaction review.\n`;

const [command, ...args] = process.argv.slice(2);
// Playwright reads its cache location when imported. This affects this process only.
process.env.PLAYWRIGHT_BROWSERS_PATH = environment().PLAYWRIGHT_BROWSERS_PATH;
try {
  if (!command || command === '--help' || command === 'help') console.log(help);
  else if (command === 'doctor') { const report = doctor(); console.log(JSON.stringify(report, null, 2)); process.exitCode = report.ready ? 0 : 1; }
  else if (command === 'setup') process.exitCode = setup(args);
  else if (commands.includes(command)) {
    if (!args.length || args.includes('--help')) console.log(upstreamHelp(command));
    else process.exitCode = execute(command, args);
  } else throw new Error(`Unknown animation command: ${command}. Use --help.`);
} catch (error) {
  console.error(`animation-tool: ${error.message}`);
  process.exitCode = 1;
}
