// Phase C: 自動運転中の「取れたはずの時間」を出す純関数。UI/Firebase非依存。
//
// ⚠評価軸(清水決定 2026-07-20)。率のベンチマークは使わない:
//   ① 分母を「自動時間」にすると『自動中はずっと働けたはず』という非現実的な前提になる。
//   ② 「自社の最高率」を目標にするのも誤り。実測で最高率のロットは自動が6〜12分しかなく、
//      短い自動ほど率が上がるだけで腕の差ではなかった。
//   → 分母は【その自動運転中に、実際に着手できた仕事の量】。自動20分でも候補が5分ぶんなら満点は5分。
//
// 区間ごとに次の4つへ割る (合計 = 自動区間の長さ):
//   used     … 実際に手作業が重なっていた時間
//   missed   … 候補があったのに取らなかった時間        → ①今の推奨モードで取れる
//   noCand   … 同ロットに候補が無かった時間            → ②別ロット横断の推奨が要る(1台ロットなど)
//   breakMs  … 休憩で抜けていた時間                    → 対象外
//
// ⚠「離れられたか」は判定しない。自動運転中に別作業を開始できるのがこのアプリの決めごと
//   (canStartTask が 自動+手動=許可)。工程マスタへ監視区分を持たせる方式は撤去済み。

import { mergeIntervals, intersectIntervals, subtractIntervals, durationMs } from './timeIntervals.js';

// 過去データからの状態復元。⚠ sessions が無い時代のデータは firstStartTime/endTime しか無い。
export const taskStatusAt = (task, at) => {
  if (!task || !at) return 'unknown';
  const first = task.firstStartTime || task.startTime || null;
  const end = task.endTime || null;
  if (!first && !end) {
    // 一度も開始していない(status が waiting/paused のまま)なら、過去のどの時点でも待ちだった。
    // それ以外(完了なのに時刻が無い等)は「いつやったか」が分からないので判定不能。0分として扱う。
    return (task.status === 'waiting' || task.status === 'paused' || !task.status) ? 'waiting' : 'unknown';
  }
  if (first && at < first) return 'waiting';
  if (end && at >= end) return 'completed';
  if (first && at >= first) return end ? 'processing' : 'processing';
  return 'unknown';
};

// 既定の並行可否。自動工程は不可。測定機を占有する工程は、その自動が測定機を使っているなら不可。
export const DEFAULT_AUTO_RESOURCE = 'measurement-machine';
export const isParallelCandidateStep = (step, { isAuto, autoResource = DEFAULT_AUTO_RESOURCE } = {}) => {
  if (!step) return false;
  if (typeof isAuto === 'function' && isAuto(step)) return false;   // 自動は同時に回せない
  if (step.parallelSafe === true) return true;
  const res = step.workResource || null;
  if (!res) return true;                                            // リソース指定なし = 機械独立
  return res !== autoResource;
};

// ある時刻に「他の台で着手できた仕事」の合計。⚠区間の開始時点で評価する近似。
//   (区間の途中で候補が増減するが、過去データには途中経過が残っていないため)
//   ⚠測定機に乗っている当の台は候補にしない (busyUnits)。その台は機械の上にあり触れない。
//     アプリ本体のライブ並行ガイド(App.jsx:13640)も「他の台」しか見ていないので、そこへ揃える。
//     段取り工程(lotOnce)も同様に候補にしない(ガイドが出していない)。
export const candidateWorkAt = ({
  steps = [], tasks = {}, quantity = 1, at, autoStepId = null, busyUnits = null,
  isAuto, autoResource = DEFAULT_AUTO_RESOURCE, keyOf = null, defaultTargetSec = 60,
} = {}) => {
  const key = keyOf || ((stepId, u) => `${stepId}-${u}`);
  const busy = busyUnits instanceof Set ? busyUnits : new Set(Array.isArray(busyUnits) ? busyUnits : []);
  const items = [];
  let unknownCount = 0;
  steps.forEach(step => {
    if (!step || step.id === autoStepId || step.lotOnce) return;
    if (!isParallelCandidateStep(step, { isAuto, autoResource })) return;
    const units = Math.max(1, quantity);
    for (let u = 0; u < units; u++) {
      if (busy.has(u)) continue;                                    // 機械に乗っている台は触れない
      const t = tasks[key(step.id, u)];
      // タスクの行そのものが無い = 一度も触っていない = 待ち。
      // ⚠アプリの推奨(globalNextTask)も「タスクが無ければ waiting」として候補に出しているので、ここも揃える。
      const st = t ? taskStatusAt(t, at) : 'waiting';
      if (st === 'unknown') { unknownCount++; continue; }
      if (st !== 'waiting') continue;                                // 進行中・完了は候補でない
      const sec = Number(step.targetTime) > 0 ? Number(step.targetTime) : defaultTargetSec;
      items.push({ stepId: step.id, title: step.title || '', unitIdx: u, ms: sec * 1000 });
    }
  });
  return { ms: items.reduce((s, x) => s + x.ms, 0), items, unknownCount };
};

// 自動区間の一覧 (台数で掛けない = 同じ工程の台は merge して機械の壁時計にする)
export const autoIntervalsByStep = ({ steps = [], tasks = {}, quantity = 1, isAuto, keyOf = null } = {}) => {
  const key = keyOf || ((stepId, u) => `${stepId}-${u}`);
  const out = [];
  steps.forEach(step => {
    if (!step || typeof isAuto !== 'function' || !isAuto(step)) return;
    const ivs = [];
    const units = step.lotOnce ? 1 : Math.max(1, quantity);
    for (let u = 0; u < units; u++) {
      const t = tasks[key(step.id, u)];
      const s = t && (t.firstStartTime || t.startTime), e = t && t.endTime;
      if (s && e && e > s) ivs.push({ start: s, end: e });
    }
    const units2 = [];
    for (let u = 0; u < units; u++) {
      const t = tasks[key(step.id, u)];
      const s = t && (t.firstStartTime || t.startTime), e = t && t.endTime;
      if (s && e && e > s) units2.push({ u, s, e });
    }
    mergeIntervals(ivs).forEach(iv => out.push({
      ...iv, stepId: step.id, title: step.title || '',
      // この区間に機械へ乗っていた台 (= 触れない台)
      units: units2.filter(x => x.s < iv.end && x.e > iv.start).map(x => x.u),
    }));
  });
  return out.sort((a, b) => a.start - b.start);
};

// 本体。1ロット分の自動区間を評価して窓の配列を返す。
//   manualIntervals: 重なりとして数える手作業の区間。省略時はこのロットの手動工程から作る。
//     ⚠別ロットの手作業も活用として数えたい場合は、呼び出し側で全ロット分を merge して渡すこと。
export const autoOpportunityWindows = ({
  lot = {}, steps = null, tasks = null, quantity = null,
  isAuto, keyOf = null, manualIntervals = null, breakIntervals = [],
  autoResource = DEFAULT_AUTO_RESOURCE, defaultTargetSec = 60,
} = {}) => {
  const st = steps || lot.steps || [];
  const tk = tasks || lot.tasks || {};
  const qty = quantity || lot.quantity || 1;
  const key = keyOf || ((stepId, u) => `${stepId}-${u}`);
  if (typeof isAuto !== 'function') return [];

  const autoIvs = autoIntervalsByStep({ steps: st, tasks: tk, quantity: qty, isAuto, keyOf: key });
  if (!autoIvs.length) return [];

  let manual = manualIntervals;
  if (!Array.isArray(manual)) {
    const ivs = [];
    st.forEach(step => {
      if (!step || isAuto(step)) return;
      const units = step.lotOnce ? 1 : Math.max(1, qty);
      for (let u = 0; u < units; u++) {
        const t = tk[key(step.id, u)];
        const s = t && (t.firstStartTime || t.startTime), e = t && t.endTime;
        if (s && e && e > s) ivs.push({ start: s, end: e });
      }
    });
    manual = ivs;
  }
  const manMerged = mergeIntervals(manual);
  const brkMerged = mergeIntervals(breakIntervals);

  return autoIvs.map(iv => {
    const win = [{ start: iv.start, end: iv.end }];
    const breakMs = durationMs(intersectIntervals(win, brkMerged));
    const effective = subtractIntervals(win, brkMerged);          // 休憩を抜いた実質の窓
    const windowMs = durationMs(effective);
    const usedMs = durationMs(intersectIntervals(effective, manMerged));
    const cand = candidateWorkAt({
      steps: st, tasks: tk, quantity: qty, at: iv.start, autoStepId: iv.stepId,
      busyUnits: iv.units, isAuto, autoResource, keyOf: key, defaultTargetSec,
    });
    const capMs = Math.min(cand.ms, windowMs);                    // 同ロットで取れた上限
    const missedMs = Math.max(0, capMs - usedMs);                 // ① 取り逃がし
    const noCandMs = Math.max(0, windowMs - capMs);               // ② 候補が無い = 別ロットが要る
    return {
      start: iv.start, end: iv.end, stepId: iv.stepId, title: iv.title, units: iv.units || [],
      windowMs, breakMs, candidateMs: cand.ms, capMs, usedMs, missedMs, noCandMs,
      candidates: cand.items, unknownCount: cand.unknownCount,
      // 率を出すなら分母は必ず capMs。windowMs で割らない(=「自動中ずっと働け」になる)
      rate: capMs > 0 ? Math.min(1, usedMs / capMs) : null,
    };
  });
};

export const summarizeWindows = (windows = []) => windows.reduce((a, w) => ({
  件数: a.件数 + 1,
  自動時間ms: a.自動時間ms + w.windowMs,
  休憩ms: a.休憩ms + w.breakMs,
  取れた上限ms: a.取れた上限ms + w.capMs,
  活用ms: a.活用ms + Math.min(w.usedMs, w.capMs),
  取り逃がしms: a.取り逃がしms + w.missedMs,
  候補なしms: a.候補なしms + w.noCandMs,
}), { 件数: 0, 自動時間ms: 0, 休憩ms: 0, 取れた上限ms: 0, 活用ms: 0, 取り逃がしms: 0, 候補なしms: 0 });
