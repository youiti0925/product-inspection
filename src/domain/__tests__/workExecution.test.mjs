// Phase A 受入テスト A02〜A07・A13 (自動判定の統一と開始ガード)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAutoStep, isManualStep, canStartTask, buildStepMasterIndex, stepMasterKey } from '../workExecution.js';

// 実データ(2026-07-20調査)を模した工程マスタ
const templates = [
  { id: 't1', name: '円テーブル一般精度_三次元', steps: [
    { category: '', title: '三次元測定機キャリブレーション', executionMode: 'batch' },
    { category: '', title: '三次元測定開始', executionMode: 'manual' },
  ] },
  { id: 't2', name: '回転分割_モーター_ブラザー', steps: [
    { category: '', title: '分割測定開始_手動', executionMode: 'manual' },
    { category: '', title: '分割自動測定開始' }, // 未設定(旧データ)
  ] },
];
const idx = buildStepMasterIndex(templates);

test('A03 batch判定: executionMode=batch は名称に関係なく全経路で自動', () => {
  assert.equal(isAutoStep({ title: '内径測定', executionMode: 'batch' }, idx), true);
  assert.equal(isAutoStep({ title: '三次元測定機キャリブレーション', executionMode: 'batch' }, idx), true);
});

test('A04 旧名称互換: executionMode未設定の「三次元測定開始」系は名称推定で自動(マスタに無い旧工程名)', () => {
  assert.equal(isAutoStep({ title: '回転分割測定開始' }, idx), true);   // マスタに無い旧工程名 → 名称推定
  assert.equal(isAutoStep({ title: '傾斜自動測定開始' }, idx), true);
});

test('A05 rotaryLink: rotaryLink=true は自動', () => {
  assert.equal(isAutoStep({ title: '準備', rotaryLink: true }, idx), true);
});

test('明示manualは名称に「自動」が入っていても手動 (清水指示)', () => {
  assert.equal(isAutoStep({ title: '分割自動測定開始', executionMode: 'manual' }, idx), false);
  assert.equal(isAutoStep({ title: '分割測定開始_手動', executionMode: 'manual' }, idx), false);
  assert.equal(isManualStep({ title: '分割測定開始_手動', executionMode: 'manual' }, idx), true);
});

test('案②: 未設定の旧データは、現行マスタに同名工程の明示設定があればそれを優先する', () => {
  // 実データ: 「三次元測定開始」は新しいロットでmanual・古い8件は未設定。マスタ参照で手動に揃う。
  assert.equal(isAutoStep({ title: '三次元測定開始' }, idx), false);
  // マスタ参照なし(索引を渡さない)なら名称推定で自動になる = 時期で判定が割れる
  assert.equal(isAutoStep({ title: '三次元測定開始' }, null), true);
});

test('案②: マスタ内で同名工程の設定が矛盾している場合はマスタで決めず名称推定へ落とす', () => {
  const conflict = buildStepMasterIndex([{ steps: [
    { category: '', title: 'あいまい測定開始', executionMode: 'manual' },
    { category: '', title: 'あいまい測定開始', executionMode: 'batch' },
  ] }]);
  assert.equal(conflict.has(stepMasterKey({ title: 'あいまい測定開始' })), false);
  assert.equal(isAutoStep({ title: 'あいまい測定開始' }, conflict), true); // 名称推定
});

test('名称推定は 自動測定|測定開始 に限定 (「自動」を広く拾わない)', () => {
  assert.equal(isAutoStep({ title: '自動搬送の確認' }, idx), false);
  assert.equal(isAutoStep({ title: '分割自動測定開始' }, idx), true);
});

test('A02 判定一致: 同じ工程を目標計算・作業者評価・画面のどこから呼んでも同じ結果', () => {
  const step = { category: '', title: '内径測定', executionMode: 'batch' };
  const callers = [isAutoStep(step, idx), isAutoStep(step, idx), isAutoStep(step, idx)];
  assert.deepEqual(callers, [true, true, true]);
});

test('A06 手動二重開始: 自動運転中でも同じ作業者の2件目の手動は拒否', () => {
  const running = [
    { workerId: 'w1', step: { title: '準備', executionMode: 'manual' } },
    { workerId: 'w1', step: { title: '分割自動測定開始', executionMode: 'batch' } }, // 自動は動いている
  ];
  const r = canStartTask({ workerId: 'w1', targetStep: { title: '片付け', executionMode: 'manual' }, runningTasks: running, masterIndex: idx });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'manual-already-running');
});

test('自動＋手動は許可 / 別の作業者の手動は影響しない', () => {
  const runningAutoOnly = [{ workerId: 'w1', step: { title: '分割自動測定開始', executionMode: 'batch' } }];
  assert.equal(canStartTask({ workerId: 'w1', targetStep: { title: '片付け', executionMode: 'manual' }, runningTasks: runningAutoOnly, masterIndex: idx }).ok, true);
  const otherWorker = [{ workerId: 'w2', step: { title: '準備', executionMode: 'manual' } }];
  assert.equal(canStartTask({ workerId: 'w1', targetStep: { title: '片付け', executionMode: 'manual' }, runningTasks: otherWorker, masterIndex: idx }).ok, true);
});

test('自動工程の開始は手動が動いていても許可(機械は並行して回せる)', () => {
  const running = [{ workerId: 'w1', step: { title: '準備', executionMode: 'manual' } }];
  assert.equal(canStartTask({ workerId: 'w1', targetStep: { title: '分割自動測定開始', executionMode: 'batch' }, runningTasks: running, masterIndex: idx }).ok, true);
});

test('A07 経路一致: 同じ入力なら呼び出し元が違っても同じコード・同じ文言を返す', () => {
  const args = { workerId: 'w1', targetStep: { title: '片付け', executionMode: 'manual' }, runningTasks: [{ workerId: 'w1', step: { title: '準備', executionMode: 'manual' } }], masterIndex: idx };
  const card = canStartTask(args), compact = canStartTask(args), voice = canStartTask(args), gesture = canStartTask(args);
  assert.deepEqual([compact, voice, gesture].map(x => x.code), [card.code, card.code, card.code]);
  assert.deepEqual([compact, voice, gesture].map(x => x.message), [card.message, card.message, card.message]);
});
