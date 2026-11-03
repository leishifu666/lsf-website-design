import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolvePlan, layerChanges, summarizeWheel } from '../lib/replay-plan.mjs';

const example = JSON.parse(await readFile(new URL('../../templates/behavior-replay.example.json', import.meta.url), 'utf8'));
test('same input plan resolves semantic targets, children and deep links independently', () => {
  const ref = resolvePlan(example, 'reference'), impl = resolvePlan(example, 'implementation');
  assert.equal(ref.targets.control.children.icon, ':scope > .icon');
  assert.equal(impl.targets.control.children.icon, ':scope > svg');
  const dest = example.experiments.at(-1).steps.at(-1).url;
  assert.equal(impl.sameOrigin(dest), 'http://localhost:4173/#city');
  assert.throws(() => ref.sameOrigin('//other.example/'));
});
test('input validation rejects unscoped activation, offscreen input and unpaired interruptions', () => {
  for (const step of [{ action: 'key', key: 'Enter' }, { action: 'move', x: -1, y: 5 },
    { action: 'click', target: 'unknown' }, { action: 'link', target: 'link', interrupt: true }]) {
    const copy = structuredClone(example);
    copy.experiments.at(-1).steps.push(step);
    assert.throws(() => resolvePlan(copy, 'reference'));
  }
});
const frame = (wallMs, y, opacity = '1') => ({ wallMs, documentStartMs: 0, scroll: { x: 0, y },
  layers: { card: { rect: { y }, style: { opacity } } } });
test('onset bounds use the actual trigger, preserving unchanged sibling properties', () => {
  const step = { action: 'click', startedMs: 0, events: [{ name: 'click', wallMs: 10 }],
    frames: [frame(0,0), frame(8,0), frame(16,0), frame(24,0,'0.8'), frame(46,0,'0.2')] };
  const observed = layerChanges(step);
  assert.deepEqual(observed.changes.card, { 'style.opacity': { firstBetweenMs: [6,14], lastChangedByMs: 36 } });
});
test('fit only when actual samples constrain a monotone response with a stationary tail', () => {
  const input = { events: [{ name:'wheel',wallMs:0 }], frames: [frame(0,0),
    ...[8,25,50,80,120,165,230,360,500,600,730].map(t => frame(t, Math.round(200*(1-Math.exp(-t/65)))))] };
  const full = summarizeWheel(input);
  assert(full.fitted && Math.abs(full.fitted.tauMs - 65) < 3);
  const interrupted = { ...input, frames: [...input.frames,frame(800,80)] };
  assert.equal(summarizeWheel(interrupted).fitted, undefined);
  assert.equal(summarizeWheel({ ...input, events: [...input.events,...input.events] }), null);
});
test('a warm reload measures arriving layers separately from the document being left', () => {
  const step = {action:'reload',startedMs:0,events:[],frames:[
    {...frame(2,0),url:'about:blank'},
    {...frame(10,0),documentStartMs:5,url:'https://example.org/'},
    {...frame(22,0,'0.2'),documentStartMs:21,url:'https://example.org/'},
    {...frame(50,0,'1'),documentStartMs:21,url:'https://example.org/'}
  ]};
  const measured = layerChanges(step);
  assert.equal(measured.documents.length,2);
  assert.deepEqual(measured.changes.card['style.opacity'].firstBetweenMs,[22,50]);
});
