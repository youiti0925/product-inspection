// Phase B: 機械運転セッション (lot.machineRuns) の記録 — 純関数・UI/Firebase非依存。
//
// なぜ必要か (仕様書 3.7 / 5.2):
//   一括5台を10分間 自動測定した場合、機械が動いた壁時計は 10分。
//   現在は「壁時計を台数で割った duration」と「各台に同じ firstStartTime/endTime」が混在しており、
//   台別按分(2分×5台)と作業者評価用の壁時計(10分)が区別できない。
//   作業者の自動中活用評価で 50分 として扱ってはいけない。
//   → 同じ機械が同じ時間に動いたなら machineRun は 1件。台別按分とは別に持つ。
//
// segments: 停止を挟んだら区間を分ける。和集合は timeIntervals.js 側で取る。
// closeReason: 'manual'(手で完了) / 'auto-end'(自動終了) / 'batch'(まとめて完了) / 'reset'(やり直し)

export const MONITORING_REQUIREMENTS = ['none', 'periodic', 'continuous'];
export const MONITORING_LABELS = {
  none: '離れてよい（自動開始後は別作業可）',
  periodic: '定期確認（確認した実時間だけ拘束）',
  continuous: '連続監視（自動中ずっと離れられない）',
};
// 未設定の既定。⚠'none' を既定にすると「離れられたのに働かなかった」と誤判定しうるため、
//   設定されるまでは判定に使わない扱い(unknown)にし、画面側で「未設定」と出す。
export const monitoringRequirementOf = (step) => {
  const v = step?.monitoringRequirement;
  return MONITORING_REQUIREMENTS.includes(v) ? v : 'unknown';
};

export const machineRunsOf = (lot) => (Array.isArray(lot?.machineRuns) ? lot.machineRuns : []);

// 開いている(最後のsegmentが閉じていない)run
const isOpenRun = (run) => {
  const segs = run?.segments || [];
  const last = segs[segs.length - 1];
  return !!(last && last.startTime && !last.endTime);
};
export const openRunForStep = (lot, stepId) =>
  machineRunsOf(lot).find(r => r.stepId === stepId && isOpenRun(r)) || null;

// 機械が実際に動いた区間 (timeIntervals の mergeIntervals へ渡す形)。
//   ⚠台数で掛けない。segments をそのまま返すだけ。
export const machineIntervalsOf = (lot, { now = null } = {}) => {
  const out = [];
  machineRunsOf(lot).forEach(run => (run.segments || []).forEach(sg => {
    if (!sg?.startTime) return;
    const end = sg.endTime || (now && now > sg.startTime ? now : null);
    if (end) out.push({ start: sg.startTime, end });
  }));
  return out;
};

// ---- 保存直前の一括適用 (作業セッションと同じ choke point で呼ぶ) ----
// resolveKey: taskKey -> { step, unitIdx } | null   (キー形式の違いを呼び出し側で吸収する)
// isAuto:     step -> boolean                       (共通 isAutoStep を渡す)
export const applyMachineRunTransitions = ({
  lot = {}, prev = {}, next = {}, now, resolveKey, isAuto, workerId = null, closeReason = 'manual',
} = {}) => {
  if (!now || !next || typeof resolveKey !== 'function' || typeof isAuto !== 'function') return machineRunsOf(lot);

  // 自動工程ごとに「今 動いている台」と「さっき動いていた台」を集める
  const running = new Map();  // stepId -> { step, units:Set }
  const scan = (map, acc) => Object.keys(map || {}).forEach(key => {
    const t = map[key];
    if (!t || t.status !== 'processing' || !t.startTime) return;
    const r = resolveKey(key);
    if (!r || !r.step || !isAuto(r.step)) return;
    const id = r.step.id || r.step.title;
    if (!acc.has(id)) acc.set(id, { step: r.step, units: new Set() });
    acc.get(id).units.add(r.unitIdx);
  });
  scan(next, running);

  let runs = machineRunsOf(lot).map(r => ({ ...r, segments: (r.segments || []).map(s => ({ ...s })) }));

  // ① 動き出した / 動き続けている
  running.forEach(({ step, units }, stepId) => {
    const open = runs.find(r => r.stepId === stepId && isOpenRun(r));
    if (open) {
      // 同じ運転の続き。台が増えていたら unitIndices へ足す (一括で後から台を足した場合)
      const merged = new Set([...(open.unitIndices || []), ...units]);
      open.unitIndices = [...merged].sort((a, b) => a - b);
      return;
    }
    const closed = runs.find(r => r.stepId === stepId && !isOpenRun(r) && r.closeReason === 'pause');
    if (closed) {
      // 一時停止からの再開 = 同じ運転に区間を足す (別の run にしない)
      closed.segments.push({ startTime: now, endTime: null });
      closed.closeReason = null;
      const merged = new Set([...(closed.unitIndices || []), ...units]);
      closed.unitIndices = [...merged].sort((a, b) => a - b);
      return;
    }
    runs.push({
      id: `run${now}-${stepId}`,
      stepId,
      stepTitle: step.title || '',
      unitIndices: [...units].sort((a, b) => a - b),
      resourceId: step.workResource || null,
      monitoringRequirement: monitoringRequirementOf(step),
      workerId,
      segments: [{ startTime: now, endTime: null }],
      closeReason: null,
    });
  });

  // ② 全台が止まった = 運転終了。開いている区間を閉じる
  runs.forEach(run => {
    if (!isOpenRun(run)) return;
    if (running.has(run.stepId)) return; // まだ動いている
    const last = run.segments[run.segments.length - 1];
    last.endTime = Math.max(now, last.startTime);
    run.closeReason = closeReason;
  });

  return runs;
};
