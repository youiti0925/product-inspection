// Phase C ②: 自動運転中に「同じロットでは出せる仕事が無くなった」時、他のロットから候補を出す (純関数)。
//
// なぜ必要か (実測 2026-07-20):
//   自動運転の未活用時間のうち、同じロットに候補が1つも無かった時間が 27.3h あった (1台ロットなど)。
//   今のライブ並行ガイドは「同じロットの他の台」しか見ないので、この時間は本人にはどうにもできない。
//
// ⚠やらないこと:
//   ・他のロットの作業をこの画面から開始しない (画面遷移せず勝手に別ロットを触らない)
//   ・順番を飛ばす提案をしない = 各台の「次にやる工程」しか出さない
//   ・他の人が作業中のロットは出さない (取り合いになる)

export const DEFAULT_AUTO_RESOURCE = 'measurement-machine';

// この台の「次にやる工程」を1つだけ返す。テンプレ順に歩き、完了/該当なしは飛ばす。
//   自動工程・並行できない工程に当たったらそこで打ち切り (先の工程を先取りさせない)。
const nextStepForUnit = ({ steps, tasks, unitIdx, isAuto, canParallel, keyOf }) => {
  for (let si = 0; si < steps.length; si++) {
    const step = steps[si];
    if (!step || step.lotOnce) continue;
    if (isAuto(step)) return null;              // 自動が来たら打ち切り
    if (!canParallel(step)) return null;        // 機械を取り合う工程が来たら打ち切り
    const t = tasks[keyOf(step.id, unitIdx)];
    const status = t ? t.status : 'waiting';
    if (status === 'completed' || status === 'skipped' || status === 'ng' || status === 'rework-done') continue;
    if (status === 'processing') return null;   // 誰かがやっている = この台は塞がっている
    return { step, stepIdx: si, unitIdx, targetSec: Number(step.targetTime) > 0 ? Number(step.targetTime) : 60 };
  }
  return null;
};

export const crossLotCandidates = ({
  lots = [], currentLotId = null, remainingSec = null,   // null = 残り時間が分からない(予定超過・目標未設定)
  isAuto, keyOf = (stepId, u) => `${stepId}-${u}`,
  autoResource = DEFAULT_AUTO_RESOURCE,
  sameZoneId = null,          // 今いる作業者エリア。同じエリアを上に出す(データが無ければ無視)
  maxItems = 3,
} = {}) => {
  if (typeof isAuto !== 'function') return [];
  const canParallel = (step) => {
    if (isAuto(step)) return false;
    if (step.parallelSafe === true) return true;
    const res = step.workResource || null;
    if (!res) return true;
    return res !== autoResource;
  };

  const out = [];
  lots.forEach(lot => {
    if (!lot || lot.id === currentLotId || lot.__id === currentLotId) return;
    if (lot.status === 'completed') return;
    const tasks = lot.tasks || {};
    // ⚠他の人が今そのロットを触っている(processing がある) なら出さない。取り合いになる。
    const busy = Object.values(tasks).some(t => t && t.status === 'processing');
    if (busy) return;
    const steps = lot.steps || [];
    const qty = lot.quantity || 1;
    for (let u = 0; u < qty; u++) {
      const nx = nextStepForUnit({ steps, tasks, unitIdx: u, isAuto, canParallel, keyOf });
      if (!nx) continue;
      out.push({
        lotId: lot.id || lot.__id || null,
        orderNo: lot.orderNo || '', model: lot.model || '', mapZoneId: lot.mapZoneId || null,
        dueDate: lot.dueDate || '', priority: lot.priority || null,
        stepId: nx.step.id, stepTitle: nx.step.title || '', unitIdx: u, targetSec: nx.targetSec,
        // ⚠不明を「収まる」と決めつけない(ChatGPT指摘 2026-07-21)。null = 判定できない
        fits: (remainingSec === null || remainingSec === undefined) ? null : nx.targetSec <= remainingSec,
        sameZone: !!(sameZoneId && lot.mapZoneId === sameZoneId),
      });
      break;   // 1ロットにつき1件だけ (同じロットの台を並べても意味がない)
    }
  });

  // 並び: ①残り時間に収まる ②同じエリア ③納期が近い ④短い順
  const dueMs = (d) => { const t = Date.parse(String(d || '').replace(/[年月]/g, '/').replace(/[日（(].*$/, '')); return Number.isFinite(t) ? t : Infinity; };
  const fitRank = (f) => (f === true ? 2 : f === null || f === undefined ? 1 : 0);   // 収まる → 不明 → 収まらない
  out.sort((a, b) =>
    (fitRank(b.fits) - fitRank(a.fits)) || (b.sameZone - a.sameZone)
    || (dueMs(a.dueDate) - dueMs(b.dueDate)) || (a.targetSec - b.targetSec));
  return out.slice(0, maxItems);
};
