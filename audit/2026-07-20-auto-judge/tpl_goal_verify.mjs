// 読み取り専用: 新コード(byTemplate profitRanking)の忠実再現。UI表示値との突合用。
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';

const CONFIG = { apiKey: "AIzaSyDiIS-TDH6MgXaLvG9T2VRioFDomQ_zQ9E", authDomain: "inspection-time-c4fd3.firebaseapp.com", projectId: "inspection-time-c4fd3" };
const app = initializeApp(CONFIG);
await signInAnonymously(getAuth(app));
const db = getFirestore(app);

const toMs = (raw) => {
  if (raw == null) return null;
  if (typeof raw === 'number') return raw;
  if (raw.seconds) return raw.seconds * 1000 + Math.floor((raw.nanoseconds || 0) / 1e6);
  const t = new Date(raw).getTime(); return isNaN(t) ? null : t;
};
const NS = 'product-inspection-v1';
const [lotsSnap, tplSnap, setSnap, impSnap] = await Promise.all([
  getDocs(collection(db, 'artifacts', NS, 'public', 'data', 'lots')),
  getDocs(collection(db, 'artifacts', NS, 'public', 'data', 'templates')),
  getDoc(doc(db, 'artifacts', NS, 'public', 'data', 'settings', 'config')),
  getDocs(collection(db, 'artifacts', NS, 'public', 'data', 'improvements')),
]);
const lots = lotsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
const templates = tplSnap.docs.map(d => ({ id: d.id, ...d.data() }));
const settings = setSnap.exists() ? setSnap.data() : {};
const improvements = impSnap.docs.map(d => ({ id: d.id, ...d.data() }));

// ==== App.jsx の新実装を忠実再現 ====
const stepKeyOf = (s) => `${s?.category || ''}_${s?.title || ''}`;
const modelGroups = settings.modelGroups || [];
const ctt = settings.customTargetTimes || {};
const effTarget = (step, model) => {
  const fallback = step?.targetTime || 0;
  if (!model) return fallback;
  const sk = stepKeyOf(step);
  const own = ctt[`model_${model}`]?.[sk];
  if (typeof own === 'number' && own > 0) return own;
  const g = modelGroups.find(gr => Array.isArray(gr?.models) && gr.models.includes(model));
  if (g) for (const sm of g.models) { if (sm === model) continue; const v = ctt[`model_${sm}`]?.[sk]; if (typeof v === 'number' && v > 0) return v; }
  return fallback;
};
const lotOnceKeysOf = (tasks, step) => Object.keys(tasks).filter(k => k.startsWith(`${step.id}-`));
const measureWindow = ({ model, stepKey, templateId, startMs, endMs }) => {
  const samples = [];
  lots.forEach(l => {
    if (!l) return;
    if (model && l.model !== model) return;
    if (templateId && l.templateId !== templateId) return;
    if (l.status !== 'completed' && l.location !== 'completed') return;
    const lotMs = toMs(l.completedAt) || toMs(l.updatedAt);
    (l.steps || []).forEach((step, idx) => {
      if (stepKey && stepKeyOf(step) !== stepKey) return;
      const tgt = effTarget(step, l.model);
      const keys = step.lotOnce ? lotOnceKeysOf(l.tasks || {}, step)
        : Array.from({ length: l.quantity || 1 }, (_, i) => ((l.tasks || {})[`${step.id}-${i}`] !== undefined ? `${step.id}-${i}` : `${idx}-${i}`));
      keys.forEach(k => {
        const t = (l.tasks || {})[k]; if (!t) return;
        if (t.status !== 'completed' && t.status !== 'ng') return;
        if (t.samplingSkipped) return;
        const d = t.duration || 0; if (d <= 0) return;
        const ms = toMs(t.endTime) || lotMs;
        if (ms == null || ms < startMs || ms > endMs) return;
        samples.push({ d, tgt });
      });
    });
  });
  const ds = samples.map(x => x.d).sort((a, b) => a - b);
  const n = ds.length;
  const median = n ? (n % 2 ? ds[(n - 1) / 2] : (ds[n / 2 - 1] + ds[n / 2]) / 2) : 0;
  const sumTgt = samples.reduce((a, x) => a + (x.tgt || 0), 0);
  return { n, median: Math.round(median), avgTarget: n ? Math.round(sumTgt / n) : 0, startMs, endMs };
};
const dataStartMsOf = () => {
  let min = Infinity;
  lots.forEach(l => {
    const lotMs = toMs(l.completedAt) || toMs(l.updatedAt);
    Object.values(l.tasks || {}).forEach(t => {
      if (!t || (t.status !== 'completed' && t.status !== 'ng')) return;
      if ((t.duration || 0) <= 0) return;
      const ms = toMs(t.endTime) || lotMs;
      if (ms != null && ms > 0 && ms < min) min = ms;
    });
  });
  return isFinite(min) ? min : null;
};
const NOW = Date.now();
const ds0 = dataStartMsOf();
const startMs = Math.max(ds0 ?? (NOW - 90 * 86400000), NOW - 90 * 86400000);
const days = Math.max(7, (NOW - startMs) / 86400000);
const charge = Number(settings.laborCostPerHour) || 2800;

// enumerate model×tpl×step
const map = new Map();
lots.forEach(l => {
  if (l.status !== 'completed' && l.location !== 'completed') return;
  const tpl = l.templateId || '';
  (l.steps || []).forEach(step => {
    const sk = stepKeyOf(step);
    const key = `${l.model}||${tpl}||${sk}`;
    if (!map.has(key)) map.set(key, { model: l.model, templateId: tpl, stepKey: sk, stepTitle: step.title });
  });
});
const pre = [];
map.forEach(ms => {
  const stat = measureWindow({ model: ms.model, stepKey: ms.stepKey, templateId: ms.templateId || undefined, startMs, endMs: NOW });
  if (stat.n < 1) return;
  pre.push({ ms, stat });
});
const nByModelStep = {};
pre.forEach(p => { const k = `${p.ms.model}||${p.ms.stepKey}`; nByModelStep[k] = (nByModelStep[k] || 0) + p.stat.n; });
const fyKey = '2026';
const annualUnitsByModel = (settings.annualProduction && settings.annualProduction[fyKey]) || {};
const rows = [];
pre.forEach(({ ms, stat }) => {
  const wdays = days; // pdcaWindowDays = (endMs-startMs)/86400000
  const measuredAnnual = Math.round(stat.n * (365 / wdays));
  const inputAnnual = annualUnitsByModel[ms.model];
  const useActual = typeof inputAnnual === 'number' && inputAnnual > 0;
  const tplShare = stat.n / Math.max(1, nByModelStep[`${ms.model}||${ms.stepKey}`]);
  const annualUnits = useActual ? Math.max(1, Math.round(inputAnnual * tplShare)) : measuredAnnual;
  const median = stat.median || 0, target = stat.avgTarget || 0;
  const red = target > 0 ? Math.max(0, median - target) : 0;
  rows.push({ ...ms, n: stat.n, annualUnits, median, target,
    annualSaveSec: annualUnits * red, annualCostSec: annualUnits * median,
    annualSaveYen: Math.round(annualUnits * red / 3600 * charge), annualCostYen: Math.round(annualUnits * median / 3600 * charge) });
});
rows.sort((a, b) => (b.annualSaveYen - a.annualSaveYen) || (b.annualCostSec - a.annualCostSec));
const totalSaveYen = rows.reduce((s, r) => s + r.annualSaveYen, 0);
const totalCostYen = rows.reduce((s, r) => s + r.annualCostYen, 0);
// 在庫: 進行中カルテ(テンプレ無し旧カルテ=全テンプレ行を塞ぐ)
const running = improvements.filter(c => c && c.model && c.stepKey && ['plan', 'doing', 'measuring'].includes(c.status));
const openKeys = new Set(running.map(c => c.templateId ? `${c.model}||${c.templateId}||${c.stepKey}` : `${c.model}||${c.stepKey}`));
const blocked = (r) => openKeys.has(`${r.model}||${r.stepKey}`) || openKeys.has(`${r.model}||${r.templateId || ''}||${r.stepKey}`);
const stockProdYen = rows.filter(r => !blocked(r)).reduce((s, r) => s + r.annualSaveYen, 0);
const tplName = Object.fromEntries(templates.map(t => [t.id, t.name || t.id]));
console.log(`窓: ${new Date(startMs).toISOString().slice(0, 10)}〜今日 (${Math.round(days)}日) チャージ¥${charge}`);
console.log(`テンプレ単位 行数=${rows.length}  年間人件費計=¥${totalCostYen.toLocaleString()}  原資計(totalSaveYen)=¥${totalSaveYen.toLocaleString()}  在庫(進行中カルテ除外)=¥${stockProdYen.toLocaleString()}`);
console.log(`原資TOP8:`);
rows.slice(0, 8).forEach(r => console.log(`  ${r.model}〔${tplName[r.templateId] || r.templateId || 'なし'}〕${r.stepTitle}: 中央値${r.median}s 目標${r.target}s 年${r.annualUnits}台 → ¥${r.annualSaveYen.toLocaleString()}/年`));
process.exit(0);
