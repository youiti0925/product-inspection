// 読み取り専用: 最終検査(golden)+製品の時間取りデータ全量調査。作戦立案の土台。書き込み一切なし。
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { writeFileSync } from 'fs';

const CONFIG = {
  apiKey: "AIzaSyDiIS-TDH6MgXaLvG9T2VRioFDomQ_zQ9E",
  authDomain: "inspection-time-c4fd3.firebaseapp.com",
  projectId: "inspection-time-c4fd3",
};
const app = initializeApp(CONFIG);
await signInAnonymously(getAuth(app));
const db = getFirestore(app);

const toMs = (raw) => {
  if (raw == null) return null;
  if (typeof raw === 'number') return raw;
  if (raw.seconds) return raw.seconds * 1000 + Math.floor((raw.nanoseconds || 0) / 1e6);
  const t = new Date(raw).getTime();
  return isNaN(t) ? null : t;
};
const ym = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };
const stats = (a) => {
  const n = a.length; if (!n) return { n: 0, med: 0, mean: 0, cv: 0, sum: 0 };
  const sum = a.reduce((x, y) => x + y, 0); const mean = sum / n;
  const sd = Math.sqrt(a.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
  return { n, med: median(a), mean, cv: mean > 0 ? sd / mean : 0, sum };
};
const load = async (ns, cols) => {
  const out = {};
  for (const c of cols) {
    if (c === 'settings') {
      const s = await getDoc(doc(db, 'artifacts', ns, 'public', 'data', 'settings', 'config'));
      out.settings = s.exists() ? s.data() : {};
    } else {
      const snap = await getDocs(collection(db, 'artifacts', ns, 'public', 'data', c));
      out[c] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  }
  return out;
};

const result = {};

// ============ 最終検査 (golden) ============
{
  const { lots, settings } = await load('final-inspection-v1', ['lots', 'settings']);
  const ctt = settings.customTargetTimes || {};
  const groups = settings.modelGroups || [];
  const sibs = (model) => { const g = groups.find(g => (g.models || []).includes(model)); return g ? g.models.filter(m => m !== model) : []; };
  const tgtOf = (model, key, stepTgt) => {
    const own = ctt[`model_${model}`]?.[key];
    if (typeof own === 'number' && own > 0) return { v: own, src: 'custom' };
    for (const s of sibs(model)) { const v = ctt[`model_${s}`]?.[key]; if (typeof v === 'number' && v > 0) return { v, src: 'group' }; }
    return { v: stepTgt || 0, src: stepTgt > 0 ? 'step' : 'none' };
  };
  const byItem = new Map(); // category_title -> {durs[], mgDurs[], tgts[], models:Set}
  const byModel = new Map();
  const byMonth = new Map();
  const byLot = [];
  let totalSec = 0, mgSecAll = 0, nAll = 0, tgtSumAll = 0, tgtKnownSec = 0;
  let completedLots = 0;
  (lots || []).forEach(l => {
    if (l.status !== 'completed' && l.location !== 'completed') return;
    completedLots++;
    const tasks = l.tasks || {}; const qty = l.quantity || 1;
    const lotMs = toMs(l.completedAt) || toMs(l.updatedAt);
    let lotSec = 0, lotN = 0;
    (l.steps || []).forEach((step, idx) => {
      const key = `${step.category || ''}_${step.title || ''}`;
      for (let u = 0; u < qty; u++) {
        const k = tasks[`${step.id}-${u}`] !== undefined ? `${step.id}-${u}` : `${idx}-${u}`;
        const t = tasks[k];
        if (!t || (t.status !== 'completed' && t.status !== 'ng')) continue;
        const d = t.duration || 0; if (d <= 0) continue;
        const ms = toMs(t.endTime) || lotMs; if (ms == null) continue;
        const tg = tgtOf(l.model, key, step.targetTime || 0);
        const e = byItem.get(key) || { key, category: step.category || '', title: step.title || '', durs: [], mg: 0, tgtSum: 0, tgtKnown: 0, models: new Set() };
        e.durs.push(d); if (t.groupMeasured) { e.mg += d; mgSecAll += d; }
        if (tg.v > 0) { e.tgtSum += tg.v; e.tgtKnown += d; tgtSumAll += tg.v; tgtKnownSec += d; }
        e.models.add(l.model || '?');
        byItem.set(key, e);
        totalSec += d; nAll++; lotSec += d; lotN++;
        byMonth.set(ym(ms), (byMonth.get(ym(ms)) || 0) + d);
        byModel.set(l.model || '?', (byModel.get(l.model || '?') || 0) + d);
      }
    });
    if (lotSec > 0) byLot.push({ model: l.model, qty, sec: lotSec, n: lotN, ms: lotMs });
  });
  const items = [...byItem.values()].map(e => {
    const st = stats(e.durs);
    return {
      key: e.key, category: e.category, title: e.title, n: st.n,
      hours: +(st.sum / 3600).toFixed(1), med: Math.round(st.med), mean: Math.round(st.mean), cv: +st.cv.toFixed(2),
      mgPct: st.sum > 0 ? Math.round(e.mg / st.sum * 100) : 0,
      tgtMed: e.tgtKnown > 0 ? Math.round(e.tgtSum / e.durs.filter((_, i) => true).length) : 0, // 平均目標(参考)
      excessPct: e.tgtSum > 0 ? Math.round((st.sum / Math.max(1, e.tgtSum) - 1) * 100) : null,
      models: e.models.size,
    };
  }).sort((a, b) => b.hours - a.hours);
  result.golden = {
    completedLots, nTasks: nAll, totalHours: +(totalSec / 3600).toFixed(1),
    mgPctAll: totalSec > 0 ? Math.round(mgSecAll / totalSec * 100) : 0,
    excessAllPct: tgtSumAll > 0 ? Math.round((tgtKnownSec / tgtSumAll - 1) * 100) : null,
    tgtCoveragePct: totalSec > 0 ? Math.round(tgtKnownSec / totalSec * 100) : 0,
    customTgtModels: Object.keys(ctt).length,
    byMonth: Object.fromEntries([...byMonth.entries()].sort().map(([k, v]) => [k, +(v / 3600).toFixed(1)])),
    byModelTop: [...byModel.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([m, s]) => [m, +(s / 3600).toFixed(1)]),
    itemsTop: items.slice(0, 25),
    itemCount: items.length,
    lotStats: (() => { const st = stats(byLot.map(x => x.sec / Math.max(1, x.qty))); return { lots: byLot.length, medPerUnitMin: Math.round(st.med / 60), cvPerUnit: +st.cv.toFixed(2) }; })(),
  };
}

// ============ 製品 ============
{
  const { lots, settings, templates, improvements } = await load('product-inspection-v1', ['lots', 'settings', 'templates', 'improvements']);
  const tplName = Object.fromEntries((templates || []).map(t => [t.id, t.name || t.id]));
  const ctt = settings.customTargetTimes || {};
  const groups = settings.modelGroups || [];
  const sibs = (model) => { const g = groups.find(g => (g.models || []).includes(model)); return g ? g.models.filter(m => m !== model) : []; };
  const tgtOf = (model, key, stepTgt) => {
    const own = ctt[`model_${model}`]?.[key];
    if (typeof own === 'number' && own > 0) return own;
    for (const s of sibs(model)) { const v = ctt[`model_${s}`]?.[key]; if (typeof v === 'number' && v > 0) return v; }
    return stepTgt || 0;
  };
  const byMTS = new Map(); // model||tpl||stepKey
  const byMS = new Map();  // model||stepKey (混在の比較用)
  const byMonth = new Map();
  let totalSec = 0, nAll = 0, completedLots = 0, autoSec = 0;
  (lots || []).forEach(l => {
    if (l.status !== 'completed' && l.location !== 'completed') return;
    completedLots++;
    const lotMs = toMs(l.completedAt) || toMs(l.updatedAt);
    const tasks = l.tasks || {};
    (l.steps || []).forEach((step, idx) => {
      const sk = `${step.category || ''}_${step.title || ''}`;
      const qty = l.quantity || 1;
      const keys = step.lotOnce
        ? Object.keys(tasks).filter(k => k.startsWith(`${step.id}-`))
        : Array.from({ length: qty }, (_, i) => (tasks[`${step.id}-${i}`] !== undefined ? `${step.id}-${i}` : `${idx}-${i}`));
      keys.forEach(k => {
        const t = tasks[k]; if (!t) return;
        if (t.status !== 'completed' && t.status !== 'ng') return;
        if (t.samplingSkipped) return;
        const d = t.duration || 0; if (d <= 0) return;
        const ms = toMs(t.endTime) || lotMs; if (ms == null) return;
        totalSec += d; nAll++;
        byMonth.set(ym(ms), (byMonth.get(ym(ms)) || 0) + d);
        if (/測定|自動/.test(step.title || '')) autoSec += d;
        const tgt = tgtOf(l.model, sk, step.targetTime || 0);
        const kk = `${l.model}||${l.templateId || ''}||${sk}`;
        const e = byMTS.get(kk) || { model: l.model, tpl: l.templateId || '', stepKey: sk, title: step.title || '', durs: [], tgt };
        e.durs.push(d); byMTS.set(kk, e);
        const k2 = `${l.model}||${sk}`;
        const e2 = byMS.get(k2) || { model: l.model, stepKey: sk, title: step.title || '', durs: [], tgt, tpls: new Map() };
        e2.durs.push(d);
        e2.tpls.set(l.templateId || '', [...(e2.tpls.get(l.templateId || '') || []), d]);
        byMS.set(k2, e2);
      });
    });
  });
  // 混在の実害: 同じ型式×工程で、テンプレ別中央値の最大/最小比が大きい所
  const mixImpact = [];
  byMS.forEach(e => {
    if (e.tpls.size < 2) return;
    const per = [...e.tpls.entries()].map(([tp, ds]) => ({ tpl: tplName[tp] || tp, n: ds.length, med: Math.round(median(ds)) })).filter(x => x.n >= 3);
    if (per.length < 2) return;
    const meds = per.map(x => x.med); const mx = Math.max(...meds), mn = Math.min(...meds);
    if (mn > 0 && mx / mn >= 1.5) mixImpact.push({ model: e.model, step: e.title, mixedMed: Math.round(median(e.durs)), per, ratio: +(mx / mn).toFixed(1), hours: +(e.durs.reduce((a, b) => a + b, 0) / 3600).toFixed(1) });
  });
  mixImpact.sort((a, b) => b.hours - a.hours);
  // テンプレ単位の山TOP
  const mtsRows = [...byMTS.values()].map(e => {
    const st = stats(e.durs);
    return { model: e.model, tpl: tplName[e.tpl] || e.tpl, step: e.title, n: st.n, hours: +(st.sum / 3600).toFixed(1), med: Math.round(st.med), cv: +st.cv.toFixed(2), tgt: e.tgt, excessPct: e.tgt > 0 ? Math.round((st.med / e.tgt - 1) * 100) : null };
  }).sort((a, b) => b.hours - a.hours);
  result.product = {
    completedLots, nTasks: nAll, totalHours: +(totalSec / 3600).toFixed(1),
    autoMeasureHours: +(autoSec / 3600).toFixed(1), autoMeasurePct: totalSec > 0 ? Math.round(autoSec / totalSec * 100) : 0,
    byMonth: Object.fromEntries([...byMonth.entries()].sort().map(([k, v]) => [k, +(v / 3600).toFixed(1)])),
    mtsTop: mtsRows.slice(0, 25),
    mixImpactTop: mixImpact.slice(0, 12),
    mixImpactCount: mixImpact.length,
    pdcaCards: (improvements || []).map(c => ({ model: c.model, step: c.stepTitle, status: c.status, createdAt: c.createdAt ? new Date(c.createdAt).toISOString().slice(0, 10) : '' })),
  };
}

writeFileSync(process.env.OUT || 'full_time_survey_result.json', JSON.stringify(result, null, 1));
// ---- 要約表示 ----
const g = result.golden, p = result.product;
console.log(`\n===== 最終検査(golden) =====`);
console.log(`完了${g.completedLots}ロット ${g.nTasks}タスク 合計${g.totalHours}h  按分(まとめ計測)率 ${g.mgPctAll}%  目標カバー率${g.tgtCoveragePct}%  目標超過 ${g.excessAllPct}%  較正済み型式 ${g.customTgtModels}`);
console.log(`月別h: ${JSON.stringify(g.byMonth)}`);
console.log(`ロット: ${g.lotStats.lots}件 台あたり中央値 ${g.lotStats.medPerUnitMin}分 CV ${g.lotStats.cvPerUnit}`);
console.log(`項目TOP15 (時間h / n / 中央値s / CV / 按分% / 目標超過%):`);
g.itemsTop.slice(0, 15).forEach(r => console.log(`  ${r.category}/${r.title}: ${r.hours}h n=${r.n} med=${r.med}s cv=${r.cv} 按分${r.mgPct}% 超過${r.excessPct == null ? '目標なし' : r.excessPct + '%'} ${r.models}型式`));
console.log(`\n===== 製品 =====`);
console.log(`完了${p.completedLots}ロット ${p.nTasks}タスク 合計${p.totalHours}h  自動測定系 ${p.autoMeasureHours}h(${p.autoMeasurePct}%)`);
console.log(`月別h: ${JSON.stringify(p.byMonth)}`);
console.log(`型式×テンプレ×工程 山TOP15:`);
p.mtsTop.slice(0, 15).forEach(r => console.log(`  ${r.model}〔${r.tpl}〕${r.step}: ${r.hours}h n=${r.n} med=${r.med}s cv=${r.cv} 超過${r.excessPct == null ? '目標なし' : r.excessPct + '%'}`));
console.log(`\nテンプレ混在の実害(同型式×同工程名でテンプレ別中央値が1.5倍以上違う): ${p.mixImpactCount}件`);
p.mixImpactTop.forEach(r => console.log(`  ${r.model} ${r.step}: 混在中央値${r.mixedMed}s ← ${r.per.map(x => `${x.tpl}=${x.med}s(n${x.n})`).join(' / ')} 比${r.ratio}倍 計${r.hours}h`));
console.log(`\nPDCAカルテ: ${p.pdcaCards.map(c => `${c.model} ${c.step} [${c.status}] ${c.createdAt}`).join(' / ') || 'なし'}`);
process.exit(0);
