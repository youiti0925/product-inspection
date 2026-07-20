// Phase C ②: 他ロットからの候補出し。⚠順番飛ばし・取り合い・機械の重複を出さないことを担保する。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crossLotCandidates } from '../crossLotGuide.js';
import { isAutoStep } from '../workExecution.js';

const isAuto = (s) => isAutoStep(s);
const AUTO = { id: 'a1', title: '回転自動測定開始', executionMode: 'batch', workResource: 'measurement-machine' };
const PREP = { id: 's1', title: '準備', executionMode: 'manual', targetTime: 300 };      // 5分
const VIS = { id: 's2', title: '外観検査', executionMode: 'manual', targetTime: 600 };   // 10分
const MACHINE = { id: 's3', title: '測定機で採寸', executionMode: 'manual', workResource: 'measurement-machine', targetTime: 120 };

const lot = (id, over = {}) => ({
  id, status: 'waiting', quantity: 1, model: 'RTT-215', orderNo: `No.${id}`,
  steps: [PREP, VIS], tasks: {}, ...over,
});

test('他ロットの「次にやる工程」を1件ずつ出す(先の工程を先取りさせない)', () => {
  const cur = lot('CUR');
  const other = lot('L2');
  const r = crossLotCandidates({ lots: [cur, other], currentLotId: 'CUR', isAuto, remainingSec: 1800 });
  assert.equal(r.length, 1);
  assert.equal(r[0].lotId, 'L2');
  assert.equal(r[0].stepTitle, '準備', '2番目の外観検査を飛ばして出さない');
});

test('完了済みの工程は飛ばして、その次を出す', () => {
  const other = lot('L2', { tasks: { 's1-0': { status: 'completed' } } });
  const r = crossLotCandidates({ lots: [lot('CUR'), other], currentLotId: 'CUR', isAuto, remainingSec: 1800 });
  assert.equal(r[0].stepTitle, '外観検査');
});

test('自分のロットは出さない / 完了したロットは出さない', () => {
  const done = lot('L3', { status: 'completed' });
  const r = crossLotCandidates({ lots: [lot('CUR'), done], currentLotId: 'CUR', isAuto, remainingSec: 1800 });
  assert.equal(r.length, 0);
});

test('誰かが作業中のロットは出さない(取り合いにしない)', () => {
  const busy = lot('L2', { tasks: { 's1-0': { status: 'processing', startTime: 1 } } });
  const r = crossLotCandidates({ lots: [lot('CUR'), busy], currentLotId: 'CUR', isAuto, remainingSec: 1800 });
  assert.equal(r.length, 0);
});

test('測定機を使う工程は出さない(自動でその機械が塞がっている)', () => {
  const other = lot('L2', { steps: [MACHINE, VIS] });
  const r = crossLotCandidates({ lots: [lot('CUR'), other], currentLotId: 'CUR', isAuto, remainingSec: 1800 });
  assert.equal(r.length, 0, '機械を取り合う工程で打ち切り、その先の外観検査も出さない');
});

test('自動工程に当たったら打ち切る(別ロットの自動を2つ同時に回させない)', () => {
  const other = lot('L2', { steps: [AUTO, VIS] });
  const r = crossLotCandidates({ lots: [lot('CUR'), other], currentLotId: 'CUR', isAuto, remainingSec: 1800 });
  assert.equal(r.length, 0);
});

test('残り時間に収まる候補を先に出す(収まらないものも捨てないが後ろ)', () => {
  const short = lot('S', { steps: [PREP] });        // 5分
  const long = lot('L', { steps: [VIS] });          // 10分
  const r = crossLotCandidates({ lots: [lot('CUR'), long, short], currentLotId: 'CUR', isAuto, remainingSec: 420 });
  assert.equal(r[0].lotId, 'S');
  assert.equal(r[0].fits, true);
  assert.equal(r[1].fits, false, '10分は残り7分に収まらない');
});

test('同じ作業者エリアのロットを上に出す', () => {
  const far = lot('FAR', { mapZoneId: 'zone_b' });
  const near = lot('NEAR', { mapZoneId: 'zone_a' });
  const r = crossLotCandidates({ lots: [lot('CUR'), far, near], currentLotId: 'CUR', isAuto, remainingSec: 1800, sameZoneId: 'zone_a' });
  assert.equal(r[0].lotId, 'NEAR');
  assert.equal(r[0].sameZone, true);
});

test('1ロットにつき1件まで。件数上限を守る', () => {
  const lots = [lot('CUR'), lot('A', { quantity: 5 }), lot('B'), lot('C'), lot('D')];
  const r = crossLotCandidates({ lots, currentLotId: 'CUR', isAuto, remainingSec: 1800, maxItems: 3 });
  assert.equal(r.length, 3);
  assert.equal(new Set(r.map(x => x.lotId)).size, 3, '同じロットを重複して出さない');
});
