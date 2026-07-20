// 【読み取り専用】自動工程判定の三者比較調査 (現行画面 / 現行🎯 / 新共通判定) と 🎯金額影響。
// 書き込みは一切しない。setDoc/updateDoc/deleteDoc は import すらしない。
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { writeFileSync } from 'fs';

const CONFIG = { apiKey: "AIzaSyDiIS-TDH6MgXaLvG9T2VRioFDomQ_zQ9E", authDomain: "inspection-time-c4fd3.firebaseapp.com", projectId: "inspection-time-c4fd3" };
const app = initializeApp(CONFIG);
await signInAnonymously(getAuth(app));
const db = getFirestore(app);
const NS = 'product-inspection-v1';
const GOAL_NS = 'goal-shared-v1';

// ===== 3種類の判定 =====
// ① 現行画面(App.jsx ローカル10箇所すべて同一ロジック)
const judgeScreen = (s) => s?.executionMode === 'batch' || (s?.title || '').includes('自動');
// ② 現行🎯(src/domain/goal/occurrence.js)
const judgeGoal = (s) => { if (!s) return false; if (s.rotaryLink) return true; return /(自動測定|測定開始)/.test(s.title || ''); };
// ③ 新共通判定(清水の指示: executionMode最優先 / 明示manualは名称無視で手動 / 名称推定は未設定のみ・自動測定|測定開始 限定)
let MASTER_IDX = null; // 案②: 現行マスタ索引(後でtemplates読込後に構築)
const judgeNew = (s) => {
  if (!s) return false;
  const em = s.executionMode;
  if (em === 'manual') return false;
  if (em === 'batch' || em === 'auto') return true;
  if (s.rotaryLink === true) return true;
  if (em) return false;
  if (MASTER_IDX) { const m = MASTER_IDX.get(`${s.category || ''}_${s.title || ''}`); if (m === 'manual') return false; if (m === 'auto') return true; }
  return /(自動測定|測定開始)/.test(s.title || '');
};

const toMs = (raw) => {
  if (raw == null) return null;
  if (typeof raw === 'number') return raw;
  if (raw.seconds) return raw.seconds * 1000 + Math.floor((raw.nanoseconds || 0) / 1e6);
  const t = new Date(raw).getTime(); return isNaN(t) ? null : t;
};
const stepKeyOf = (s) => `${s?.category || ''}_${s?.title || ''}`;

const [tplSnap, lotSnap, setSnap, gSnap, impSnap] = await Promise.all([
  getDocs(collection(db, 'artifacts', NS, 'public', 'data', 'templates')),
  getDocs(collection(db, 'artifacts', NS, 'public', 'data', 'lots')),
  getDoc(doc(db, 'artifacts', NS, 'public', 'data', 'settings', 'config')),
  getDoc(doc(db, 'artifacts', GOAL_NS, 'public', 'data', 'settings', 'config')),
  getDocs(collection(db, 'artifacts', NS, 'public', 'data', 'improvements')),
]);
const templates = tplSnap.docs.map(d => ({ id: d.id, ...d.data() }));
const lots = lotSnap.docs.map(d => ({ id: d.id, ...d.data() }));
const settings = setSnap.exists() ? setSnap.data() : {};
const goalCfg = gSnap.exists() ? gSnap.data() : {};
const improvements = impSnap.docs.map(d => ({ id: d.id, ...d.data() }));

// 案②の索引を構築(App側 buildStepMasterIndex と同じ規則: 明示設定のみ・矛盾は除外)
{
  const acc = new Map();
  templates.forEach(t => (t.steps || []).forEach(s => {
    const em = s?.executionMode;
    if (em !== 'manual' && em !== 'batch' && em !== 'auto') return;
    const k = `${s.category || ''}_${s.title || ''}`;
    if (!acc.has(k)) acc.set(k, new Set());
    acc.get(k).add(em);
  }));
  MASTER_IDX = new Map();
  acc.forEach((modes, k) => {
    const autoish = modes.has('batch') || modes.has('auto');
    const manualish = modes.has('manual');
    if (autoish && manualish) return;
    MASTER_IDX.set(k, autoish ? 'auto' : 'manual');
  });
}

const R = {}; // 結果

// ========== ① 工程マスタ(テンプレート)の棚卸し ==========
const tplSteps = [];
templates.forEach(t => (t.steps || []).forEach((s, i) => tplSteps.push({ tplId: t.id, tplName: t.name || t.id, idx: i, ...s })));
const emCount = { auto: 0, batch: 0, manual: 0, other: {}, unset: 0 };
tplSteps.forEach(s => {
  const em = s.executionMode;
  if (em === 'auto') emCount.auto++;
  else if (em === 'batch') emCount.batch++;
  else if (em === 'manual') emCount.manual++;
  else if (em) emCount.other[em] = (emCount.other[em] || 0) + 1;
  else emCount.unset++;
});
R.masterTotals = {
  テンプレート数: templates.length,
  工程総数: tplSteps.length,
  executionMode: { auto: emCount.auto, batch: emCount.batch, manual: emCount.manual, その他: emCount.other, 未設定: emCount.unset },
  rotaryLink_true: tplSteps.filter(s => s.rotaryLink === true).length,
};

// 名称推定だけで自動になる工程(executionMode未設定 かつ 名称が自動測定|測定開始)
const nameOnlyAuto = {};
tplSteps.forEach(s => {
  if (!s.executionMode && !s.rotaryLink && /(自動測定|測定開始)/.test(s.title || '')) {
    const k = `${s.category || ''}／${s.title}`;
    (nameOnlyAuto[k] = nameOnlyAuto[k] || { 工程: k, テンプレ: new Set() }).テンプレ.add(s.tplName);
  }
});
R.名称推定だけで自動 = Object.values(nameOnlyAuto).map(x => ({ 工程: x.工程, テンプレ数: x.テンプレ.size, テンプレ例: [...x.テンプレ].slice(0, 3) }));

// 「自動」を含むが 自動測定|測定開始 ではない名称(=現行画面のみ自動・新判定では未設定だと手動)
const looseAutoName = {};
tplSteps.forEach(s => {
  const t = s.title || '';
  if (t.includes('自動') && !/(自動測定|測定開始)/.test(t)) {
    const k = `${s.category || ''}／${t}`;
    (looseAutoName[k] = looseAutoName[k] || { 工程: k, em: new Set(), n: 0 });
    looseAutoName[k].em.add(s.executionMode || '(未設定)');
    looseAutoName[k].n++;
  }
});
R.自動を含むが限定パターン外 = Object.values(looseAutoName).map(x => ({ 工程: x.工程, 件数: x.n, executionMode: [...x.em] }));

// ========== ② 判定比較(工程マスタ) ==========
const cmpKey = (s) => `${s.category || ''}／${s.title || ''}`;
const cmpMap = new Map();
tplSteps.forEach(s => {
  const k = cmpKey(s);
  const e = cmpMap.get(k) || { 工程: k, em: new Set(), rotary: false, n: 0, screen: judgeScreen(s), goal: judgeGoal(s), neo: judgeNew(s), tpl: new Set() };
  e.n++; e.em.add(s.executionMode || '(未設定)'); if (s.rotaryLink === true) e.rotary = true; e.tpl.add(s.tplName);
  // 同名工程でも設定が違う場合があるため、判定は OR ではなく件数で持つ
  e.screenT = (e.screenT || 0) + (judgeScreen(s) ? 1 : 0);
  e.goalT = (e.goalT || 0) + (judgeGoal(s) ? 1 : 0);
  e.neoT = (e.neoT || 0) + (judgeNew(s) ? 1 : 0);
  cmpMap.set(k, e);
});
const fmt = (e) => ({ 工程: e.工程, 件数: e.n, executionMode: [...e.em], rotaryLink: e.rotary, 現行画面: `${e.screenT}/${e.n}自動`, '現行🎯': `${e.goalT}/${e.n}自動`, 新判定: `${e.neoT}/${e.n}自動`, テンプレ例: [...e.tpl].slice(0, 2) });
R['画面と🎯で判定が違う工程'] = [...cmpMap.values()].filter(e => e.screenT !== e.goalT).map(fmt);
R.新判定で画面と結果が変わる工程 = [...cmpMap.values()].filter(e => e.neoT !== e.screenT).map(fmt);
R['新判定で🎯と結果が変わる工程'] = [...cmpMap.values()].filter(e => e.neoT !== e.goalT).map(fmt);

// 判断が曖昧: ①同名工程で設定がバラバラ ②明示manualなのに名称に自動 ③rotaryLinkとexecutionModeが矛盾
const ambiguous = [];
[...cmpMap.values()].forEach(e => { if (e.em.size > 1) ambiguous.push({ 種別: '同名工程で設定がバラバラ', ...fmt(e) }); });
tplSteps.forEach(s => {
  if (s.executionMode === 'manual' && (s.title || '').includes('自動')) ambiguous.push({ 種別: '明示manualだが名称に「自動」', 工程: cmpKey(s), テンプレ: s.tplName });
  if (s.executionMode === 'manual' && s.rotaryLink === true) ambiguous.push({ 種別: '明示manualだがrotaryLink=true', 工程: cmpKey(s), テンプレ: s.tplName });
});
R.判断が曖昧な工程 = ambiguous;

// ========== ③ 完了タスクへの影響(ロットに焼き付いたstepsで判定) ==========
const NOW = Date.now();
const changed = { screenToNeo: new Map(), goalToNeo: new Map() };
let totalTasks = 0, totalSec = 0;
lots.forEach(l => {
  if (l.status !== 'completed' && l.location !== 'completed') return;
  const tasks = l.tasks || {};
  (l.steps || []).forEach((step, idx) => {
    const sc = judgeScreen(step), go = judgeGoal(step), ne = judgeNew(step);
    const qty = l.quantity || 1;
    const keys = step.lotOnce ? Object.keys(tasks).filter(k => k.startsWith(`${step.id}-`))
      : Array.from({ length: qty }, (_, i) => (tasks[`${step.id}-${i}`] !== undefined ? `${step.id}-${i}` : `${idx}-${i}`));
    keys.forEach(k => {
      const t = tasks[k]; if (!t) return;
      if (t.status !== 'completed' && t.status !== 'ng') return;
      const d = t.duration || 0; if (d <= 0) return;
      totalTasks++; totalSec += d;
      const key = `${step.category || ''}／${step.title || ''}`;
      if (sc !== ne) { const e = changed.screenToNeo.get(key) || { 工程: key, 旧画面: sc ? '自動' : '手動', 新: ne ? '自動' : '手動', タスク数: 0, 実績秒: 0 }; e.タスク数++; e.実績秒 += d; changed.screenToNeo.set(key, e); }
      if (go !== ne) { const e = changed.goalToNeo.get(key) || { 工程: key, '旧🎯': go ? '自動' : '手動', 新: ne ? '自動' : '手動', タスク数: 0, 実績秒: 0 }; e.タスク数++; e.実績秒 += d; changed.goalToNeo.set(key, e); }
    });
  });
});
const hrs = (s) => Math.round(s / 3600 * 10) / 10;
R.完了タスク全体 = { タスク数: totalTasks, 実績時間h: hrs(totalSec) };
R.影響_画面判定が変わる完了タスク = [...changed.screenToNeo.values()].sort((a, b) => b.実績秒 - a.実績秒).map(e => ({ ...e, 実績h: hrs(e.実績秒) }));
R['影響_🎯判定が変わる完了タスク'] = [...changed.goalToNeo.values()].sort((a, b) => b.実績秒 - a.実績秒).map(e => ({ ...e, 実績h: hrs(e.実績秒) }));

// ========== ④ 🎯金額の変更前後 (profitRanking byTemplate をisAutoStep差し替えで2回) ==========
const ctt = settings.customTargetTimes || {};
const groups = settings.modelGroups || [];
const effTarget = (step, model) => {
  const fb = step?.targetTime || 0;
  if (!model) return fb;
  const sk = stepKeyOf(step);
  const own = ctt[`model_${model}`]?.[sk];
  if (typeof own === 'number' && own > 0) return own;
  const g = groups.find(gr => Array.isArray(gr?.models) && gr.models.includes(model));
  if (g) for (const sm of g.models) { if (sm === model) continue; const v = ctt[`model_${sm}`]?.[sk]; if (typeof v === 'number' && v > 0) return v; }
  return fb;
};
const measure = ({ model, stepKey, templateId, startMs, endMs }) => {
  const samples = []; let unitsSeen = 0;
  lots.forEach(l => {
    if (model && l.model !== model) return;
    if (templateId && l.templateId !== templateId) return;
    if (l.status !== 'completed' && l.location !== 'completed') return;
    const lotMs = toMs(l.completedAt) || toMs(l.updatedAt);
    let has = false;
    (l.steps || []).forEach((step, idx) => {
      if (stepKey && stepKeyOf(step) !== stepKey) return;
      has = true;
      const tgt = effTarget(step, l.model);
      const tasks = l.tasks || {};
      const keys = step.lotOnce ? Object.keys(tasks).filter(k => k.startsWith(`${step.id}-`))
        : Array.from({ length: l.quantity || 1 }, (_, i) => (tasks[`${step.id}-${i}`] !== undefined ? `${step.id}-${i}` : `${idx}-${i}`));
      keys.forEach(k => {
        const t = tasks[k]; if (!t) return;
        if (t.status !== 'completed' && t.status !== 'ng') return;
        if (t.samplingSkipped) return;
        const d = t.duration || 0; if (d <= 0) return;
        const ms = toMs(t.endTime) || lotMs;
        if (ms == null || ms < startMs || ms > endMs) return;
        samples.push({ d, tgt });
      });
    });
    if (has && lotMs != null && lotMs >= startMs && lotMs <= endMs) unitsSeen += (l.quantity || 1);
  });
  const ds = samples.map(x => x.d).sort((a, b) => a - b);
  const n = ds.length;
  const median = n ? (n % 2 ? ds[(n - 1) / 2] : (ds[n / 2 - 1] + ds[n / 2]) / 2) : 0;
  const sumTgt = samples.reduce((a, x) => a + (x.tgt || 0), 0);
  return { n, median: Math.round(median), avgTarget: n ? Math.round(sumTgt / n) : 0, unitsSeen, days: Math.max(1, (endMs - startMs) / 86400000) };
};
let dataStart = Infinity;
lots.forEach(l => { const lm = toMs(l.completedAt) || toMs(l.updatedAt); Object.values(l.tasks || {}).forEach(t => { if (!t || (t.status !== 'completed' && t.status !== 'ng')) return; if ((t.duration || 0) <= 0) return; const ms = toMs(t.endTime) || lm; if (ms != null && ms > 0 && ms < dataStart) dataStart = ms; }); });
const winStart = Math.max(isFinite(dataStart) ? dataStart : NOW - 90 * 86400000, NOW - 90 * 86400000);
const fyKey = '2026';
const yearCfg = { ...(goalCfg.years || {})[fyKey] };
const charge = Number(yearCfg.chargePerHour) || Number(settings.laborCostPerHour) || 2800;
const engine = { autoLaborPct: 100, ...(goalCfg.engine || {}) };
const annualUnitsByModel = (settings.annualProduction && settings.annualProduction[fyKey]) || {};

const runRanking = (judge, autoLaborPct) => {
  const map = new Map();
  lots.forEach(l => {
    if (l.status !== 'completed' && l.location !== 'completed') return;
    (l.steps || []).forEach(step => {
      const sk = stepKeyOf(step);
      const key = `${l.model}||${l.templateId || ''}||${sk}`;
      if (!map.has(key)) map.set(key, { model: l.model, templateId: l.templateId || '', stepKey: sk, stepTitle: step.title, auto: judge(step) });
    });
  });
  const pre = [];
  map.forEach(ms => { const st = measure({ model: ms.model, stepKey: ms.stepKey, templateId: ms.templateId || undefined, startMs: winStart, endMs: NOW }); if (st.n < 1) return; pre.push({ ms, st }); });
  const unitsByMS = {};
  pre.forEach(p => { const k = `${p.ms.model}||${p.ms.stepKey}`; unitsByMS[k] = (unitsByMS[k] || 0) + (p.st.unitsSeen || 0); });
  const rows = [];
  pre.forEach(({ ms, st }) => {
    const measuredAnnual = Math.round(st.n * (365 / st.days));
    const inputAnnual = annualUnitsByModel[ms.model];
    const useActual = typeof inputAnnual === 'number' && inputAnnual > 0;
    const windowUnits = unitsByMS[`${ms.model}||${ms.stepKey}`] || 0;
    let annualUnits = measuredAnnual;
    if (useActual && windowUnits > 0) annualUnits = Math.max(1, Math.round(inputAnnual * (st.n / windowUnits)));
    const median = st.median || 0, target = st.avgTarget || 0;
    const red = target > 0 ? Math.max(0, median - target) : 0;
    const costRaw = annualUnits * median, saveRaw = annualUnits * red;
    const isAuto = ms.auto;
    const pct = Math.min(100, Math.max(0, autoLaborPct));
    const laborCost = isAuto ? costRaw * pct / 100 : costRaw;
    const laborSave = isAuto ? saveRaw * pct / 100 : saveRaw;
    rows.push({ ...ms, n: st.n, annualUnits, median, target,
      annualCostSec: Math.round(laborCost), annualSaveSec: Math.round(laborSave),
      machineCostSec: isAuto ? Math.round(costRaw) : 0,
      annualCostYen: Math.round(laborCost / 3600 * charge), annualSaveYen: Math.round(laborSave / 3600 * charge) });
  });
  const open = new Set(improvements.filter(c => c && ['plan', 'doing', 'measuring'].includes(c.status)).map(c => c.templateId ? `${c.model}||${c.templateId}||${c.stepKey}` : `${c.model}||${c.stepKey}`));
  const blocked = (r) => open.has(`${r.model}||${r.stepKey}`) || open.has(`${r.model}||${r.templateId || ''}||${r.stepKey}`);
  return {
    totalCostYen: rows.reduce((s, r) => s + r.annualCostYen, 0),
    totalSaveYen: rows.reduce((s, r) => s + r.annualSaveYen, 0),
    stockYen: rows.filter(r => !blocked(r)).reduce((s, r) => s + r.annualSaveYen, 0),
    machineH: Math.round(rows.reduce((s, r) => s + r.machineCostSec, 0) / 3600),
    autoRows: rows.filter(r => r.auto).length, rows: rows.length,
  };
};
const cur = runRanking(judgeGoal, engine.autoLaborPct);
const neo = runRanking(judgeNew, engine.autoLaborPct);
const cur30 = runRanking(judgeGoal, 30);
const neo30 = runRanking(judgeNew, 30);
R['🎯金額'] = {
  設定: { 'チャージ円per時': charge, autoLaborPct現在: engine.autoLaborPct, 窓: `${new Date(winStart).toISOString().slice(0, 10)}〜今日`, 年間台数登録型式数: Object.values(annualUnitsByModel).filter(v => Number(v) > 0).length },
  現在の拘束率での比較: {
    '変更前_現行🎯判定': { 候補在庫円: cur.stockYen, 年間人件費円: cur.totalCostYen, 機械時間h: cur.machineH, 自動行数: cur.autoRows },
    変更後_新判定: { 候補在庫円: neo.stockYen, 年間人件費円: neo.totalCostYen, 機械時間h: neo.machineH, 自動行数: neo.autoRows },
    差額: { 候補在庫円: neo.stockYen - cur.stockYen, 年間人件費円: neo.totalCostYen - cur.totalCostYen, 機械時間h: neo.machineH - cur.machineH },
  },
  '参考_拘束率を30%にした場合': {
    変更前: { 候補在庫円: cur30.stockYen, 年間人件費円: cur30.totalCostYen },
    変更後: { 候補在庫円: neo30.stockYen, 年間人件費円: neo30.totalCostYen },
    差額: { 候補在庫円: neo30.stockYen - cur30.stockYen, 年間人件費円: neo30.totalCostYen - cur30.totalCostYen },
  },
  総行数: cur.rows,
};

writeFileSync(process.env.OUT || 'auto_judge_survey.json', JSON.stringify(R, null, 1));
console.log(JSON.stringify(R, null, 1));
process.exit(0);
