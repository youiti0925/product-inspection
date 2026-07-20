// Phase B.1: ロット保存の共通パイプライン (テスト可能な形へ抽出)。
//
// B.0 では App.jsx のクロージャ内に直書きしていたため、
//   ・保存を「連続して」通した時の挙動 (直前の生成結果の引き継ぎ)
//   ・Firestore の prop 更新前に次の操作が来た場合
// をテストできなかった。ここへ出して統合テストの対象にする。
//
// ⚠同時編集について (B.1 で表現を訂正):
//   この保存は setDoc(merge:true) であり Firestore トランザクションではない。
//   「多端末でも安全」ではない。開閉処理を冪等にして"壊れにくく"しているだけで、
//   同じロットを同時に2端末で操作すれば後勝ちで区間が失われうる。
//   → 運用制約: 同じロットは同時に複数端末で操作しないこと。
//   → 恒久対策(未実施): runTransaction 化、またはセッションを別コレクションへ追記型で持つ。

import { applySessionTransitions, sessionsOf, closeSession, openSession } from './workSessions.js';
import { applyMachineRunTransitions } from './machineRuns.js';

// 担当変更 (B.1 #3): 進行中タスクは、停止を挟まなくても担当が変わった時点で区間を割る。
//   A が開始 → 停止せず B へ担当変更 → B が完了 のとき、A の区間と B の区間が両方残る。
//   これをやらないと、開いているセッションの workerId は開始した A のままで、
//   B が働いた時間まで A に付く(= B.0 の「それぞれの人の時間になる」は成立していなかった)。
export const splitSessionsOnHandoff = ({ tasks = {}, now, newWorkerId, newWorkerName = '' } = {}) => {
  if (!now || !newWorkerId) return { tasks, changed: false };
  const out = { ...tasks };
  let changed = false;
  Object.keys(tasks).forEach(key => {
    const t = tasks[key];
    if (!t || t.status !== 'processing' || !t.startTime) return;
    const open = sessionsOf(t).find(s => s && s.startTime && !s.endTime);
    if (!open) return;
    if (open.workerId === newWorkerId) return; // 既に新担当の区間
    const closed = closeSession(t, { now });
    out[key] = openSession(closed, { now, workerId: newWorkerId, workerName: newWorkerName, source: 'handoff' });
    changed = true;
  });
  return { tasks: out, changed };
};

// ⚠B.1 の実機検証で判明した必須処理:
//   画面側の React state (tasks) には、このパイプラインが付けた sessions が入っていない。
//   (setTasks は sessions を足す前の値で呼ばれ、Firestore の購読が返るまで反映されない)
//   そのため次の遷移は「sessions を持たないタスク」から組み立てられ、
//   開いているセッションを見つけられず閉じられない ＝ 開始したまま永遠に閉じない区間ができる。
//   → 前回保存時の sessions を、next 側が持っていない場合だけ引き継ぐ。
//   例外: やり直し等で waiting へ戻し firstStartTime も消しているタスクは、履歴ごと初期化する。
const carrySessions = (prev, next) => {
  const out = { ...next };
  Object.keys(next).forEach(key => {
    const after = next[key];
    const before = prev[key];
    if (!after || typeof after !== 'object') return;
    if (Array.isArray(after.sessions)) return;             // 明示的に持っているならそれが正
    const isReset = after.status === 'waiting' && !after.firstStartTime;
    if (isReset) { out[key] = { ...after, sessions: [] }; return; }
    if (before && Array.isArray(before.sessions)) out[key] = { ...after, sessions: before.sessions };
  });
  return out;
};

// 保存1回分の変換。副作用なし。呼び出し側は返ってきた nextTasks / nextRuns を
// 「直前に生成した値」として保持し、次回の prevTasks / prevRuns に渡すこと (Firestore の往復を待たない)。
export const buildLotSave = ({
  payload = {}, lot = {}, prevTasks = {}, prevRuns = null, now,
  workerId = null, workerName = '', resolveKey, isAuto, resolveWorkerName = null,
} = {}) => {
  const currentWorkerId = workerId || lot.workerId || null;

  // ① 担当変更のみの保存 (changeInspector は onSave({workerId}) しか呼ばない)
  const handoffTo = payload.workerId && payload.workerId !== currentWorkerId ? payload.workerId : null;
  let baseTasks = payload.tasks || null;
  let handoffApplied = false;
  if (handoffTo && !baseTasks) {
    const nm = (typeof resolveWorkerName === 'function' ? resolveWorkerName(handoffTo) : '') || '';
    const r = splitSessionsOnHandoff({ tasks: prevTasks, now, newWorkerId: handoffTo, newWorkerName: nm });
    if (r.changed) { baseTasks = r.tasks; handoffApplied = true; }
  }

  if (!baseTasks) {
    // tasks に触らない保存 (合計時間の flush など) はそのまま通す
    return { payload, tasks: prevTasks, machineRuns: prevRuns, touched: false };
  }

  // 画面 state が落としてきた sessions を復元してから判定する (これが無いと区間が閉じない)
  baseTasks = carrySessions(prevTasks, baseTasks);

  const effectiveWorkerId = handoffTo || currentWorkerId;
  const effectiveWorkerName = handoffTo
    ? ((typeof resolveWorkerName === 'function' ? resolveWorkerName(handoffTo) : '') || workerName)
    : workerName;

  // ② 手動作業セッション。開始/再開は startTime の出現、停止/完了は startTime の消失で捕捉する
  let nextTasks = handoffApplied
    ? baseTasks // 担当変更だけの保存では startTime の出入りが無いので二重適用しない
    : applySessionTransitions({ prev: prevTasks, next: baseTasks, now, workerId: effectiveWorkerId, workerName: effectiveWorkerName });

  // ③ tasks を伴う保存でも担当が同時に変わっているなら分割する
  if (handoffTo && !handoffApplied) {
    const nm = (typeof resolveWorkerName === 'function' ? resolveWorkerName(handoffTo) : '') || '';
    nextTasks = splitSessionsOnHandoff({ tasks: nextTasks, now, newWorkerId: handoffTo, newWorkerName: nm }).tasks;
  }

  // ④ 機械運転。⚠prevRuns を必ず使う。lot.machineRuns は Firestore の往復が終わるまで古い。
  const nextRuns = applyMachineRunTransitions({
    lot, prev: prevTasks, next: nextTasks, now,
    prevRuns: Array.isArray(prevRuns) ? prevRuns : (lot.machineRuns || []),
    resolveKey, isAuto, workerId: effectiveWorkerId,
  });

  const hadRuns = (Array.isArray(prevRuns) ? prevRuns : (lot.machineRuns || [])).length > 0;
  const hasRuns = Array.isArray(nextRuns) && nextRuns.length > 0;
  const outPayload = {
    ...payload,
    tasks: nextTasks,
    ...((hadRuns || hasRuns) ? { machineRuns: nextRuns } : {}),
  };
  return { payload: outPayload, tasks: nextTasks, machineRuns: nextRuns, touched: true };
};
