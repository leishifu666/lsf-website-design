import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertFreshOutput, flag, skillRoot, upstreamHelp, runtime } from '../lib/animation-runtime.mjs';

test('output guard preserves evidence and follows upstream last-value-wins flags', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lsf-animation-'));
  try {
    const empty = join(dir, 'empty'); mkdirSync(empty);
    writeFileSync(join(dir, 'evidence.json'), '{}');
    assert.throws(() => assertFreshOutput('capture', ['--out', dir]), /Refusing/);
    assert.throws(() => assertFreshOutput('compare', ['--out', empty, `--out=${dir}`]), /Refusing/);
    assert.doesNotThrow(() => assertFreshOutput('capture', ['--out', empty]));
    assert.doesNotThrow(() => assertFreshOutput('frames', ['--probe', '--out', dir]));
    assert.throws(() => assertFreshOutput('gl', ['compare', '--out', join(dir, 'evidence.json')]), /Refusing/);
    assert.throws(() => assertFreshOutput('easing', ['--out', join(dir, 'unused.json')]), /stdout/);
    assert.throws(() => assertFreshOutput('capture', ['--out']), /requires/);
    assert.equal(flag(['--out=x', '--out', 'y'], 'out'), 'y');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('every CLI help exposes actual upstream arguments without installing dependencies', () => {
  for (const command of ['capture', 'frames', 'compare', 'sheet', 'easing', 'gl']) {
    const result = spawnSync(process.execPath, [join(skillRoot, 'scripts/animation-tool.mjs'), command, '--help'], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`${command}\\.ts`));
  }
  const captureHelp = upstreamHelp('capture');
  assert.match(captureHelp, /--clock MODE\s+real \(default\)/);
  assert.match(captureHelp, /virtual: step instrumented/);
  assert.match(captureHelp, /Repeat the source capture to measure render noise/);
  assert.match(captureHelp, /frame-state\.json \(estimated for real-clock video\)/);
  assert.match(captureHelp, /real: keep this much time after the trigger input finishes/);
  assert.match(captureHelp, /--scroll-steps/);
  assert.match(upstreamHelp('gl'), /--timing 80/);
});

test('current supported Node is used without any Bun installation', () => {
  assert.equal(runtime({}, '24.11.0'), process.execPath);
  assert.equal(runtime({}, '22.18.0'), process.execPath);
});
