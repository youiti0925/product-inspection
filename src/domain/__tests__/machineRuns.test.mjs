// Phase B 受入テスト — 仕様書「9. 受入テスト」の T08 / T09 / T14 (機械の壁時計)。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMachineRunTransitions, machineIntervalsOf, machineRunsOf,
} from '../machineRuns.js';
import * as machineRunsModule from '../machineRuns.js';
import { mergeIntervals, durationMs } from '../timeIntervals.js';
import { isAutoStep } from '../workExecution.js';

const T0 = 1784451600000;
const M = 60000;
const min = (ms) => ms / M;

const AUTO = { id: 'st-auto', title: '回転自動測定開始', executionMode: 'batch', workResource: 'measurement-machine' };
const MANUAL = { id: 'st-man', title: '外観検査', executionMode: 'manual' };
const STEPS = [AUTO, MANUAL];

// taskKey = `${stepId}-${unitIdx}`
const resolveKey = (key) => {
  const i = key.lastIndexOf('-');
  const stepId = key.slice(0, i);
  const step = STEPS.find(s => s.id === stepId);
  return step ? { step, unitIdx: Number(key.slice(i + 1)) } : null;
};
const isAuto = (s) => isAutoStep(s);
const run = (lot, prev, next, now, closeReason = 'manual') =>
  ({ ...lot, machineRuns: applyMachineRunTransitions({ lot, prev, next, now, resolveKey, isAuto, closeReason }) });

const proc = (now) => ({ status: 'processing', startTime: now });
const done = () => ({ status: 'completed', startTime: null });

test('T08 一括5台10分: machineRun は 10分1件 (50分にしない)', () => {
  const prev = {}, mid = {};
  for (let u = 0; u < 5; u++) { prev[`st-auto-${u}`] = { status: 'waiting', startTime: null }; mid[`st-auto-${u}`] = proc(T0); }
  let lot = run({}, prev, mid, T0);
  assert.equal(machineRunsOf(lot).length, 1, '5台でも運転は1件');
  assert.deepEqual(machineRunsOf(lot)[0].unitIndices, [0, 1, 2, 3, 4]);

  const end = {};
  for (let u = 0; u < 5; u++) end[`st-auto-${u}`] = done();
  lot = run(lot, mid, end, T0 + 10 * M, 'batch');

  assert.equal(machineRunsOf(lot).length, 1);
  assert.equal(min(durationMs(machineIntervalsOf(lot))), 10, '機械の壁時計は10分');
  assert.notEqual(min(durationMs(machineIntervalsOf(lot))), 50);
  assert.equal(machineRunsOf(lot)[0].closeReason, 'batch');
});

test('T09 自動区間の重複: 同じ時間に重なった運転を二重計上しない', () => {
  // 別々の自動工程が 10:00-11:00 と 10:30-11:30 で重なる想定を、区間の和集合で確認
  const intervals = [{ start: T0, end: T0 + 60 * M }, { start: T0 + 30 * M, end: T0 + 90 * M }];
  assert.equal(min(durationMs(intervals)), 90);
  assert.equal(mergeIntervals(intervals).length, 1);
});

test('停止を挟んだ運転は segments が分かれ、止まっていた時間は入らない', () => {
  const k = 'st-auto-0';
  let lot = run({}, { [k]: { status: 'waiting', startTime: null } }, { [k]: proc(T0) }, T0);
  lot = run(lot, { [k]: proc(T0) }, { [k]: { status: 'paused', startTime: null } }, T0 + 5 * M, 'pause');
  lot = run(lot, { [k]: { status: 'paused', startTime: null } }, { [k]: proc(T0 + 8 * M) }, T0 + 8 * M);
  lot = run(lot, { [k]: proc(T0 + 8 * M) }, { [k]: done() }, T0 + 12 * M, 'auto-end');

  const runs = machineRunsOf(lot);
  assert.equal(runs.length, 1, '再開は同じ運転の続き(別runにしない)');
  assert.equal(runs[0].segments.length, 2);
  assert.equal(min(durationMs(machineIntervalsOf(lot))), 9, '5分+4分=9分(止まっていた3分は入らない)');
});

test('手動工程は machineRun を作らない', () => {
  const k = 'st-man-0';
  const lot = run({}, { [k]: { status: 'waiting', startTime: null } }, { [k]: proc(T0) }, T0);
  assert.equal(machineRunsOf(lot).length, 0);
});

test('T14(撤去) monitoringRequirement は書かない。API も残さない', () => {
  // 「人は離れられますか？」設定は撤去した。答えはアプリの作りに既にあり、人に設定させる意味がなかった:
  //   自動+手動=許可(離れてよい設計) + 張り付いた時間は interruptions(type='monitoring') で実記録。
  ['MONITORING_REQUIREMENTS', 'MONITORING_LABELS', 'MONITORING_DEFAULT', 'monitoringRequirementOf']
    .forEach(k => assert.equal(machineRunsModule[k], undefined, `${k} は撤去済みであること`));

  const runs = applyMachineRunTransitions({
    lot: {}, prev: { 'st-auto-0': { status: 'waiting', startTime: null } },
    next: { 'st-auto-0': proc(T0) }, now: T0, resolveKey, isAuto,
  });
  assert.equal(runs.length, 1);
  assert.ok(!('monitoringRequirement' in runs[0]), '新しい run に監視区分を焼き込まない');
});

test('古いデータに monitoringRequirement が残っていてもエラーにならず、無視される', () => {
  // 既存 Firestore の step / machineRun に残った旧フィールドは削除も移行もしない。読まないだけ。
  const step = { ...AUTO, monitoringRequirement: 'continuous' };
  const rk = (key) => ({ step, unitIdx: Number(key.split('-').pop()) });
  const oldLot = {
    machineRuns: [{
      id: 'old1', stepId: 'st-auto', stepTitle: '回転自動測定開始', unitIndices: [0],
      monitoringRequirement: 'continuous',            // ← 旧フィールド
      segments: [{ startTime: T0 - 30 * M, endTime: T0 - 20 * M }], closeReason: 'manual',
    }],
  };
  const runs = applyMachineRunTransitions({
    lot: oldLot, prev: { 'st-auto-0': { status: 'waiting', startTime: null } },
    next: { 'st-auto-0': proc(T0) }, now: T0, resolveKey: rk, isAuto,
  });
  assert.equal(runs.length, 2, '旧runは残したまま新runを足す');
  assert.equal(runs[0].monitoringRequirement, 'continuous', '旧データは書き換えない(一括削除しない)');
  assert.ok(!('monitoringRequirement' in runs[1]), '新しい run には付けない');
  assert.equal(min(durationMs(machineIntervalsOf({ ...oldLot, machineRuns: runs }, { now: T0 + 5 * M }))), 15);
});

test('進行中の運転は now を渡した時だけ区間になる(開きっぱなしを0分にも無限にもしない)', () => {
  const k = 'st-auto-0';
  const lot = run({}, { [k]: { status: 'waiting', startTime: null } }, { [k]: proc(T0) }, T0);
  assert.equal(durationMs(machineIntervalsOf(lot)), 0, 'nowなしでは未確定として0');
  assert.equal(min(durationMs(machineIntervalsOf(lot, { now: T0 + 7 * M }))), 7);
});
