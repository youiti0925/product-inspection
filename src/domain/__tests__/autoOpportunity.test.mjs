// Phase C: 自動運転中の「取れたはずの時間」の評価軸テスト。
// ⚠評価の分母は「その時間に着手できた仕事の量」。自動時間そのものでも、自社最高率でもない。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  taskStatusAt, isParallelCandidateStep, candidateWorkAt,
  autoIntervalsByStep, autoOpportunityWindows, summarizeWindows,
} from '../autoOpportunity.js';
import { isAutoStep } from '../workExecution.js';

const T0 = 1784451600000;
const M = 60000;
const min = (ms) => ms / M;
const isAuto = (s) => isAutoStep(s);

const AUTO = { id: 'a1', title: '回転自動測定開始', executionMode: 'batch', workResource: 'measurement-machine', targetTime: 1200 };
const MANUAL = { id: 'm1', title: '外観検査', executionMode: 'manual', targetTime: 300 };          // 5分
const MANUAL2 = { id: 'm2', title: '記入', executionMode: 'manual', targetTime: 180 };             // 3分
const MACHINE_MANUAL = { id: 'm3', title: '測定機で採寸', executionMode: 'manual', workResource: 'measurement-machine', targetTime: 600 };
const done = (s, e) => ({ status: 'completed', firstStartTime: s, endTime: e, startTime: null });
const waiting = () => ({ status: 'waiting', startTime: null });

test('taskStatusAt: 過去の任意時刻の状態を firstStartTime/endTime から復元する', () => {
  const t = done(T0 + 10 * M, T0 + 20 * M);
  assert.equal(taskStatusAt(t, T0), 'waiting');
  assert.equal(taskStatusAt(t, T0 + 15 * M), 'processing');
  assert.equal(taskStatusAt(t, T0 + 20 * M), 'completed');
  assert.equal(taskStatusAt({ status: 'completed', duration: 300 }, T0), 'unknown', '時刻が無ければ waiting と決めつけない');
});

test('並行候補: 自動と、自動が使う測定機を占有する工程は候補にしない', () => {
  assert.equal(isParallelCandidateStep(AUTO, { isAuto }), false);
  assert.equal(isParallelCandidateStep(MANUAL, { isAuto }), true, 'リソース指定なし=機械独立');
  assert.equal(isParallelCandidateStep(MACHINE_MANUAL, { isAuto }), false, '測定機の取り合いは候補外');
  assert.equal(isParallelCandidateStep({ ...MACHINE_MANUAL, parallelSafe: true }, { isAuto }), true);
});

test('候補の仕事量: その時刻に waiting の台だけ数える(進行中・完了は数えない)', () => {
  const steps = [AUTO, MANUAL];
  const tasks = {
    'a1-0': done(T0, T0 + 20 * M),
    'm1-0': done(T0 + 30 * M, T0 + 35 * M),   // 開始時点では waiting
    'm1-1': done(T0 - 10 * M, T0 - 5 * M),    // 開始時点では既に完了
  };
  const c = candidateWorkAt({ steps, tasks, quantity: 2, at: T0, autoStepId: 'a1', isAuto });
  assert.equal(min(c.ms), 5, '待ちの1台ぶん(5分)だけ');
  assert.equal(c.items.length, 1);
});

test('T-C01 自動20分・候補5分・実際に5分やった = 満点(取り逃がし0)。率の分母は自動時間ではない', () => {
  const steps = [AUTO, MANUAL];
  // m1-0 は窓の前に終わっている = 候補でない。候補は m1-1 の5分だけ
  const tasks = { 'a1-0': done(T0, T0 + 20 * M), 'm1-0': done(T0 - 9 * M, T0 - 4 * M), 'm1-1': done(T0 + 2 * M, T0 + 7 * M) };
  const [w] = autoOpportunityWindows({ lot: { steps, tasks, quantity: 2 }, isAuto });
  assert.equal(min(w.windowMs), 20);
  assert.equal(min(w.candidateMs), 5);
  assert.equal(min(w.capMs), 5, '取れる上限は候補の量であって自動時間ではない');
  assert.equal(min(w.usedMs), 5);
  assert.equal(w.missedMs, 0, '5分しか無い所で5分やったら満点');
  assert.equal(w.rate, 1);
  assert.equal(min(w.noCandMs), 15, '残り15分は候補が無かった時間(②別ロットが要る)');
});

test('T-C02 候補があったのに取らなかった = ①取り逃がし', () => {
  const steps = [AUTO, MANUAL, MANUAL2];
  const tasks = {
    'a1-0': done(T0, T0 + 20 * M),
    'm1-0': done(T0 - 9 * M, T0 - 4 * M), 'm2-0': done(T0 - 4 * M, T0 - 1 * M),  // 窓の前に完了
    'm1-1': waiting(), 'm2-1': waiting(),                                       // 待ち = 候補 5分+3分
  };
  const [w] = autoOpportunityWindows({ lot: { steps, tasks, quantity: 2 }, isAuto });
  assert.equal(min(w.capMs), 8, '5分+3分');
  assert.equal(w.usedMs, 0);
  assert.equal(min(w.missedMs), 8, '取れた8分をまるごと逃がした');
  assert.equal(min(w.noCandMs), 12);
});

test('T-C03 1台ロットは候補ゼロ = ②へ回す(①の取り逃がしにしない)', () => {
  const steps = [AUTO, MANUAL];
  const tasks = { 'a1-0': done(T0, T0 + 30 * M), 'm1-0': done(T0 - 5 * M, T0 - 1 * M) };
  const [w] = autoOpportunityWindows({ lot: { steps, tasks, quantity: 1 }, isAuto });
  assert.equal(w.candidateMs, 0);
  assert.equal(w.missedMs, 0, '候補が無いのに「取り逃がし」と言ってはいけない');
  assert.equal(min(w.noCandMs), 30, '別ロット横断の推奨が要る時間');
  assert.equal(w.rate, null, '分母0の率は出さない(0%と表示しない)');
});

test('T-C04 一括5台は台数で掛けない。機械の壁時計1件として評価する', () => {
  const steps = [AUTO, MANUAL];
  const tasks = {};
  for (let u = 0; u < 5; u++) tasks[`a1-${u}`] = done(T0, T0 + 10 * M);
  const ivs = autoIntervalsByStep({ steps, tasks, quantity: 5, isAuto });
  assert.equal(ivs.length, 1);
  assert.equal(min(ivs[0].end - ivs[0].start), 10, '50分にしない');
});

test('T-C05 休憩は窓から抜く(取り逃がしにも候補なしにも数えない)', () => {
  const steps = [AUTO, MANUAL];
  const tasks = { 'a1-0': done(T0, T0 + 20 * M), 'm1-1': waiting() };
  const [w] = autoOpportunityWindows({
    lot: { steps, tasks, quantity: 2 }, isAuto,
    breakIntervals: [{ start: T0 + 5 * M, end: T0 + 15 * M }],
  });
  assert.equal(min(w.breakMs), 10);
  assert.equal(min(w.windowMs), 10, '休憩を除いた実質の窓');
  assert.equal(min(w.missedMs + w.noCandMs + w.usedMs), 10, '合計は実質の窓に一致する');
});

test('T-C06 別ロットの手作業を渡せば活用として数える(取り逃がしが減る)', () => {
  const steps = [AUTO, MANUAL];
  const tasks = { 'a1-0': done(T0, T0 + 20 * M), 'm1-0': done(T0 - 9 * M, T0 - 4 * M), 'm1-1': waiting() };
  const base = { lot: { steps, tasks, quantity: 2 }, isAuto };
  const [self] = autoOpportunityWindows(base);
  assert.equal(min(self.missedMs), 5);
  const [cross] = autoOpportunityWindows({ ...base, manualIntervals: [{ start: T0 + 1 * M, end: T0 + 9 * M }] });
  assert.equal(min(cross.usedMs), 8, '別ロットで8分働いていた');
  assert.equal(cross.missedMs, 0, '上限5分を超えて働いていたので取り逃がしなし');
});

test('T-C07 4つの内訳の合計は必ず自動時間に一致する(どこにも消えない・二重に数えない)', () => {
  const steps = [AUTO, MANUAL, MANUAL2, MACHINE_MANUAL];
  const tasks = {
    'a1-0': done(T0, T0 + 40 * M), 'a1-1': done(T0 + 5 * M, T0 + 30 * M),
    'm1-1': waiting(), 'm2-1': done(T0 + 10 * M, T0 + 13 * M), 'm3-1': waiting(),
  };
  const ws = autoOpportunityWindows({ lot: { steps, tasks, quantity: 2 }, isAuto });
  ws.forEach(w => {
    const parts = Math.min(w.usedMs, w.capMs) + w.missedMs + w.noCandMs;
    assert.equal(parts, w.windowMs, '活用+取り逃がし+候補なし = 自動時間');
  });
  const s = summarizeWindows(ws);
  assert.equal(s.活用ms + s.取り逃がしms + s.候補なしms, s.自動時間ms);
});

test('T-C08 完了なのに時刻が無い旧タスクは候補に数えず、判定不能として件数だけ返す', () => {
  const steps = [AUTO, MANUAL];
  //   0台目 … 測定機に乗っている  = 触れない
  //   1台目 … 完了だが時刻が無い  = いつやったか不明 = 判定不能。候補に水増ししない
  //   2台目 … 行が無い            = 一度も触っていない = 待ち (アプリの推奨と同じ扱い)
  const tasks = { 'a1-0': done(T0, T0 + 20 * M), 'm1-1': { status: 'completed', duration: 300 } };
  const [w] = autoOpportunityWindows({ lot: { steps, tasks, quantity: 3 }, isAuto });
  assert.equal(min(w.candidateMs), 5, '待ちの1台ぶんだけ。判定不能は入れない');
  assert.equal(w.unknownCount, 1);
  assert.equal(min(w.missedMs), 5);
  assert.equal(min(w.noCandMs), 15);
});

test('T-C09 測定機に乗っている当の台は候補にしない(1台ロットは必ず候補ゼロ)', () => {
  // ⚠実データに流して発覚した設計ミス。アプリ本体のライブ並行ガイドも「他の台」しか見ていない。
  const steps = [AUTO, MANUAL];
  const tasks = { 'a1-0': done(T0, T0 + 20 * M) };   // 0台目が機械の上。m1-0 は未着手
  const [one] = autoOpportunityWindows({ lot: { steps, tasks, quantity: 1 }, isAuto });
  assert.equal(one.candidateMs, 0, '1台しかないなら他にできる台は無い');
  assert.equal(min(one.noCandMs), 20);
  const [two] = autoOpportunityWindows({ lot: { steps, tasks, quantity: 2 }, isAuto });
  assert.equal(min(two.candidateMs), 5, '2台目は触れるので候補になる');
});

test('T-C10 段取り工程(lotOnce)は候補にしない(ライブ並行ガイドが出していない)', () => {
  const steps = [AUTO, { id: 'p1', title: '片付け', executionMode: 'manual', targetTime: 600, lotOnce: true }];
  const tasks = { 'a1-0': done(T0, T0 + 20 * M) };
  const [w] = autoOpportunityWindows({ lot: { steps, tasks, quantity: 2 }, isAuto });
  assert.equal(w.candidateMs, 0);
});
