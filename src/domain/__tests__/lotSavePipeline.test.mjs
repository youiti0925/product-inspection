// Phase B.1 統合テスト — 純関数単体ではなく「連続した保存処理」を実画面と同じ入口(buildLotSave)へ通す。
//
// B.0 の穴: 個々の純関数は緑だったが、
//   ・machineRuns を毎回 lot.machineRuns から作り直していた (Firestoreの往復前に停止すると閉じられない)
//   ・closeReason を既定値 'manual' で決めていたため、実画面からは 'pause' が絶対に立たず再開が別runに割れる
//   ・担当変更は onSave({workerId}) だけで tasks を伴わないため、区間が分割されない
// これらは「保存を連続で通す」形でしか出ない。ここで固定する。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLotSave, splitSessionsOnHandoff } from '../lotSavePipeline.js';
import { sessionsOf, sessionsDurationMs } from '../workSessions.js';
import { machineIntervalsOf } from '../machineRuns.js';
import { durationMs } from '../timeIntervals.js';
import { isAutoStep } from '../workExecution.js';

const T0 = 1784451600000;
const M = 60000;
const min = (ms) => ms / M;

const AUTO = { id: 'st-auto', title: '回転自動測定開始', executionMode: 'batch', workResource: 'measurement-machine' };
const MANUAL = { id: 'st-man', title: '外観検査', executionMode: 'manual' };
const STEPS = [AUTO, MANUAL];
const WORKERS = [{ id: 'wA', name: '尾田' }, { id: 'wB', name: '片山' }];

const resolveKey = (key) => {
  const i = key.lastIndexOf('-');
  const step = STEPS.find(s => s.id === key.slice(0, i));
  return step ? { step, unitIdx: Number(key.slice(i + 1)) } : null;
};

// 実画面と同じ順序で保存を積む小さなハーネス。
//   ⚠lot.machineRuns はわざと更新しない = Firestore の prop がまだ返ってきていない状態を再現する。
// syncLotWorkerId=false にすると「Firestore の購読が返る前」= lot.workerId が古いままの状況を再現する。
const makeScreen = (initialLot = {}, { syncLotWorkerId = true } = {}) => {
  const state = {
    lot: { workerId: 'wA', tasks: {}, ...initialLot },
    prevTasks: initialLot.tasks || {},
    prevRuns: initialLot.machineRuns || [],
    // B.1.1: App.jsx の lastSavedWorkerIdRef 相当。lot.workerId ではなくこちらを正とする
    workerIdRef: initialLot.workerId || 'wA',
    saved: [],
  };
  const nameOf = (wid) => (WORKERS.find(w => w.id === wid) || {}).name || '';
  return {
    state,
    save(payload, now) {
      const curWorkerId = state.workerIdRef || state.lot.workerId;
      const r = buildLotSave({
        payload, lot: state.lot, now,
        prevTasks: state.prevTasks, prevRuns: state.prevRuns,
        workerId: curWorkerId, workerName: nameOf(curWorkerId),
        resolveKey, isAuto: isAutoStep,
        resolveWorkerName: nameOf,
      });
      // 担当変更は touched の有無に関係なく即時確定
      if (payload.workerId) state.workerIdRef = payload.workerId;
      if (r.touched) { state.prevTasks = r.tasks; state.prevRuns = r.machineRuns; }
      // lot(prop) は Firestore の購読が返ってから更新される
      if (payload.workerId && syncLotWorkerId) state.lot = { ...state.lot, workerId: payload.workerId };
      state.saved.push(r.payload);
      return r;
    },
    // 現在のタスク(画面の state 相当)
    tasks: () => state.prevTasks,
    runs: () => state.prevRuns,
  };
};

const startWrite = (t, now) => ({ ...(t || {}), status: 'processing', startTime: now, firstStartTime: (t && t.firstStartTime) || now });
const pauseWrite = (t, now) => ({ ...t, status: 'paused', duration: (t.duration || 0) + Math.floor((now - t.startTime) / 1000), startTime: null, pausedAt: now });
const completeWrite = (t, now) => ({ ...t, status: 'completed', duration: (t.duration || 0) + Math.floor((now - t.startTime) / 1000), startTime: null, endTime: now, firstStartTime: t.firstStartTime || t.startTime });

// ---------------------------------------------------------------------------

// 画面の React state は sessions を持たない。実機(エミュレータ)で最初に露見した不具合の再現。
//   setTasks はパイプラインが sessions を足す前の値で呼ばれるため、次の遷移は sessions 無しで組み立てられる。
//   これを引き継がないと「開始したまま永遠に閉じない区間」ができる。
const stripSessions = (tasks) => {
  const out = {};
  Object.keys(tasks).forEach(k => { const { sessions, ...rest } = tasks[k]; out[k] = rest; });
  return out;
};

test('B.1 実機で発覚: 画面stateがsessionsを落としても、停止で区間が閉じる', () => {
  const k = 'st-man-0';
  const sc = makeScreen();
  sc.save({ tasks: { [k]: startWrite(null, T0) } }, T0);
  assert.equal(sessionsOf(sc.tasks()[k]).length, 1);
  assert.equal(sessionsOf(sc.tasks()[k])[0].endTime, null);

  // ここが実機の状況: 画面は sessions を持たないタスクから次の状態を作る
  const screenState = stripSessions(sc.tasks());
  assert.equal(screenState[k].sessions, undefined);
  sc.save({ tasks: { [k]: pauseWrite(screenState[k], T0 + 5 * M) } }, T0 + 5 * M);

  const ss = sessionsOf(sc.tasks()[k]);
  assert.equal(ss.length, 1, 'セッションが消えない');
  assert.notEqual(ss[0].endTime, null, '区間が閉じている');
  assert.equal(min(sessionsDurationMs(sc.tasks()[k])), 5);
});

test('B.1 実機同等: sessionsを落とした状態で 開始→停止→再開→完了 が正しく2区間になる', () => {
  const k = 'st-man-0';
  const sc = makeScreen();
  const step = (mk, now) => sc.save({ tasks: { [k]: mk(stripSessions(sc.tasks())[k] || null, now) } }, now);
  sc.save({ tasks: { [k]: startWrite(null, T0) } }, T0);
  step(pauseWrite, T0 + 2 * M);
  step(startWrite, T0 + 5 * M);
  step(completeWrite, T0 + 9 * M);

  const ss = sessionsOf(sc.tasks()[k]);
  assert.equal(ss.length, 2);
  assert.equal(min(sessionsDurationMs(sc.tasks()[k])), 6, '実作業6分(停止3分を含めない)');
});

test('B.1 実機で発覚: 区間の合計が duration と一致する(保存時刻でなく pausedAt/endTime で閉じる)', () => {
  const k = 'st-man-0';
  const sc = makeScreen();
  sc.save({ tasks: { [k]: startWrite(null, T0) } }, T0);
  // アプリは T0+2分 に停止処理をしたが、保存が走るのは 3秒後だったとする
  const paused = pauseWrite(stripSessions(sc.tasks())[k], T0 + 2 * M);
  sc.save({ tasks: { [k]: paused } }, T0 + 2 * M + 3000);
  sc.save({ tasks: { [k]: startWrite(stripSessions(sc.tasks())[k], T0 + 5 * M) } }, T0 + 5 * M);
  const done = completeWrite(stripSessions(sc.tasks())[k], T0 + 9 * M);
  sc.save({ tasks: { [k]: done } }, T0 + 9 * M + 2000);

  const t = sc.tasks()[k];
  assert.equal(min(sessionsDurationMs(t)), 6, '区間合計は6分ちょうど');
  assert.equal(t.duration, 360, 'duration も360秒');
  assert.equal(sessionsDurationMs(t) / 1000, t.duration, '区間合計と duration が一致する');
});

test('やり直しでwaitingへ戻したタスクは sessions も初期化する', () => {
  const k = 'st-man-0';
  const sc = makeScreen();
  sc.save({ tasks: { [k]: startWrite(null, T0) } }, T0);
  sc.save({ tasks: { [k]: completeWrite(sc.tasks()[k], T0 + 5 * M) } }, T0 + 5 * M);
  sc.save({ tasks: { [k]: { status: 'waiting', duration: 0, startTime: null, firstStartTime: null, endTime: null } } }, T0 + 6 * M);
  assert.deepEqual(sessionsOf(sc.tasks()[k]), []);
});

test('B.1 #1 Firestoreのprop更新前に停止しても、開いた run が閉じる', () => {
  const k = 'st-auto-0';
  const sc = makeScreen();
  sc.save({ tasks: { [k]: startWrite(null, T0) } }, T0);
  assert.equal(sc.runs().length, 1);
  assert.equal(sc.runs()[0].segments[0].endTime, null, '開始直後は開いている');

  // ここで lot.machineRuns はまだ古いまま(= Firestore の往復が終わっていない)
  assert.deepEqual(sc.state.lot.machineRuns, undefined);

  sc.save({ tasks: { [k]: pauseWrite(sc.tasks()[k], T0 + 4 * M) } }, T0 + 4 * M);
  const runs = sc.runs();
  assert.equal(runs.length, 1, 'run が増えていない');
  assert.notEqual(runs[0].segments[0].endTime, null, '開いた run が閉じている');
  assert.equal(min(durationMs(machineIntervalsOf({ machineRuns: runs }))), 4);
});

test('B.1 #4 実画面と同じ入口で 開始→停止→再開→完了: run 1件 / segments 2件', () => {
  const k = 'st-auto-0';
  const sc = makeScreen();
  sc.save({ tasks: { [k]: startWrite(null, T0) } }, T0);                                    // 開始
  sc.save({ tasks: { [k]: pauseWrite(sc.tasks()[k], T0 + 5 * M) } }, T0 + 5 * M);           // 停止
  assert.equal(sc.runs()[0].closeReason, 'pause', 'closeReason が実データから pause と推論される');

  sc.save({ tasks: { [k]: startWrite(sc.tasks()[k], T0 + 8 * M) } }, T0 + 8 * M);           // 再開
  sc.save({ tasks: { [k]: completeWrite(sc.tasks()[k], T0 + 12 * M) } }, T0 + 12 * M);      // 完了

  const runs = sc.runs();
  assert.equal(runs.length, 1, 'run は1件 (再開で別runに割れない)');
  assert.equal(runs[0].segments.length, 2, 'segments は2件');
  assert.equal(min(durationMs(machineIntervalsOf({ machineRuns: runs }))), 9, '5分+4分=9分 (止まっていた3分は入らない)');
  assert.equal(runs[0].closeReason, 'manual');
});

test('B.1 #3 Aが開始→停止せずBへ担当変更→Bが完了 → A/B 両方に区間が残る', () => {
  const k = 'st-man-0';
  const sc = makeScreen({ workerId: 'wA' });
  sc.save({ tasks: { [k]: startWrite(null, T0) } }, T0);                       // A が開始
  assert.equal(sessionsOf(sc.tasks()[k])[0].workerId, 'wA');

  // 担当変更。changeInspector は tasks を伴わず onSave({workerId}) しか呼ばない
  const r = sc.save({ workerId: 'wB' }, T0 + 6 * M);
  assert.equal(r.touched, true, '担当変更だけの保存でも tasks が書き換わる');
  assert.ok(r.payload.tasks, '保存ペイロードに tasks が入る');

  sc.save({ tasks: { [k]: completeWrite(sc.tasks()[k], T0 + 10 * M) } }, T0 + 10 * M); // B が完了

  const ss = sessionsOf(sc.tasks()[k]);
  assert.equal(ss.length, 2, '担当変更の時刻で区間が割れる');
  assert.equal(ss[0].workerId, 'wA');
  assert.equal(ss[1].workerId, 'wB');
  assert.equal(min(ss[0].endTime - ss[0].startTime), 6, 'A は 6分');
  assert.equal(min(ss[1].endTime - ss[1].startTime), 4, 'B は 4分');
  assert.equal(min(sessionsDurationMs(sc.tasks()[k])), 10, '合計は10分のまま(水増ししない)');
  assert.equal(ss[1].source, 'handoff');
});

// ---- B.1.1 担当交代直後の競合 ----

test('B.1.1 担当変更直後に別タスクを開始: lot.workerId が古いままでも新担当で記録される', () => {
  // Firestore の購読が返る前を再現 (lot.workerId は A のまま更新しない)
  const sc = makeScreen({ workerId: 'wA' }, { syncLotWorkerId: false });

  const r = sc.save({ workerId: 'wB' }, T0);               // 担当を B へ (進行中タスク無し)
  assert.equal(r.touched, false, '進行中タスクが無いので tasks は書き換わらない');
  assert.equal(sc.state.lot.workerId, 'wA', '前提: lot(prop) はまだ A のまま');
  assert.equal(sc.state.workerIdRef, 'wB', 'touched:false でも担当refは即時に B へ進む');

  sc.save({ tasks: { 'st-man-0': startWrite(null, T0 + 1 * M) } }, T0 + 1 * M); // 直後に開始

  const ss = sessionsOf(sc.tasks()['st-man-0']);
  assert.equal(ss.length, 1);
  assert.equal(ss[0].workerId, 'wB', '新担当 B で開始される (A にならない)');
  assert.equal(ss[0].workerName, '片山', 'workerName も ref の workerId から解決される');
});

test('B.1.1 担当変更直後に完了まで進めても、区間は最後まで新担当のまま', () => {
  const sc = makeScreen({ workerId: 'wA' }, { syncLotWorkerId: false });
  sc.save({ workerId: 'wB' }, T0);
  sc.save({ tasks: { 'st-man-0': startWrite(null, T0 + 1 * M) } }, T0 + 1 * M);
  const cur = sc.tasks()['st-man-0'];
  sc.save({ tasks: { 'st-man-0': completeWrite(cur, T0 + 6 * M) } }, T0 + 6 * M);

  const ss = sessionsOf(sc.tasks()['st-man-0']);
  assert.equal(ss.length, 1);
  assert.equal(ss[0].workerId, 'wB');
  assert.equal(min(ss[0].endTime - ss[0].startTime), 5);
});

test('B.1.1 進行中タスクがある担当変更は、従来どおり区間を分割する(退行なし)', () => {
  const k = 'st-man-0';
  const sc = makeScreen({ workerId: 'wA' }, { syncLotWorkerId: false });
  sc.save({ tasks: { [k]: startWrite(null, T0) } }, T0);
  const r = sc.save({ workerId: 'wB' }, T0 + 4 * M);
  assert.equal(r.touched, true);
  sc.save({ tasks: { [k]: completeWrite(sc.tasks()[k], T0 + 9 * M) } }, T0 + 9 * M);

  const ss = sessionsOf(sc.tasks()[k]);
  assert.equal(ss.length, 2);
  assert.equal(ss[0].workerId, 'wA');
  assert.equal(ss[1].workerId, 'wB');
  assert.equal(min(ss[0].endTime - ss[0].startTime), 4);
  assert.equal(min(ss[1].endTime - ss[1].startTime), 5);
});

test('B.1 #3 担当変更しても進行中でないタスクは触らない', () => {
  const k = 'st-man-0';
  const sc = makeScreen({ workerId: 'wA' });
  sc.save({ tasks: { [k]: startWrite(null, T0) } }, T0);
  sc.save({ tasks: { [k]: completeWrite(sc.tasks()[k], T0 + 5 * M) } }, T0 + 5 * M);
  const before = JSON.stringify(sc.tasks());
  const r = sc.save({ workerId: 'wB' }, T0 + 9 * M);
  assert.equal(r.touched, false, '完了済みだけなら書き換えない');
  assert.equal(JSON.stringify(sc.tasks()), before);
});

test('splitSessionsOnHandoff: 同じ担当への変更は何もしない(冪等)', () => {
  const tasks = { k: { status: 'processing', startTime: T0, sessions: [{ id: 's', startTime: T0, endTime: null, workerId: 'wA' }] } };
  const r = splitSessionsOnHandoff({ tasks, now: T0 + M, newWorkerId: 'wA' });
  assert.equal(r.changed, false);
});

test('一括5台: 実画面と同じ入口でも run は1件・壁時計10分 (50分にしない)', () => {
  const sc = makeScreen();
  const t0 = {}, t1 = {};
  for (let u = 0; u < 5; u++) t0[`st-auto-${u}`] = startWrite(null, T0);
  sc.save({ tasks: t0 }, T0);
  for (let u = 0; u < 5; u++) t1[`st-auto-${u}`] = completeWrite(sc.tasks()[`st-auto-${u}`], T0 + 10 * M);
  sc.save({ tasks: t1 }, T0 + 10 * M);

  const runs = sc.runs();
  assert.equal(runs.length, 1);
  assert.deepEqual(runs[0].unitIndices, [0, 1, 2, 3, 4]);
  assert.equal(min(durationMs(machineIntervalsOf({ machineRuns: runs }))), 10);
  assert.equal(runs[0].closeReason, 'batch', '複数台の同時完了は batch と推論される');
});

test('tasks を伴わない保存(合計時間のflushなど)は素通りする', () => {
  const sc = makeScreen();
  const r = sc.save({ totalWorkTime: 1234 }, T0);
  assert.equal(r.touched, false);
  assert.equal(r.payload.totalWorkTime, 1234);
  assert.equal(r.payload.tasks, undefined, '余計な tasks を書き足さない');
});

test('自動工程が無いロットに machineRuns を書き足さない', () => {
  const sc = makeScreen();
  const r = sc.save({ tasks: { 'st-man-0': startWrite(null, T0) } }, T0);
  assert.equal(r.payload.machineRuns, undefined);
});

test('連続保存: 手動と自動を並行しても互いの区間を壊さない', () => {
  const sc = makeScreen();
  sc.save({ tasks: { 'st-auto-0': startWrite(null, T0) } }, T0);                                     // 自動開始
  sc.save({ tasks: { ...sc.tasks(), 'st-man-0': startWrite(null, T0 + 1 * M) } }, T0 + 1 * M);        // 手動を並行開始
  sc.save({ tasks: { ...sc.tasks(), 'st-man-0': completeWrite(sc.tasks()['st-man-0'], T0 + 7 * M) } }, T0 + 7 * M);
  sc.save({ tasks: { ...sc.tasks(), 'st-auto-0': completeWrite(sc.tasks()['st-auto-0'], T0 + 10 * M) } }, T0 + 10 * M);

  assert.equal(min(sessionsDurationMs(sc.tasks()['st-man-0'])), 6, '手動は6分');
  assert.equal(min(durationMs(machineIntervalsOf({ machineRuns: sc.runs() }))), 10, '機械は10分');
  assert.equal(sc.runs().length, 1);
  assert.equal(sessionsOf(sc.tasks()['st-auto-0']).length, 1);
});
