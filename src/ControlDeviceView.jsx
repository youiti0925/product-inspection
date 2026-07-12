import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Cpu, Plus, Trash2, Upload, Printer, AlertTriangle, Pencil, X, Check, Info, Wand2, List, Download } from 'lucide-react';
import * as CD from './controlDevices.js';

// SheetJS(xlsx) は .xls/.xlsx 両対応。号機マスタの実Excel(転置レイアウト)取込で使うが
// 大きいので必要時のみ動的読み込み（初回importでチャンク分割される）。
let _xlsxPromise = null;
function loadXLSX() { if (!_xlsxPromise) _xlsxPromise = import('xlsx'); return _xlsxPromise; }

// 容量の選択肢（モーター/号機で共用）。号機9のB/C=130A、RTT-465傾斜軸=180A も選べるように。
const CAP_OPTS = ['', '10A', '20A', '40A', '80A', '130A', '160A', '180A', '360A'];

// ───────── 共通ユーティリティ ─────────
const DAY_MS = 86400000;
const todayYmd = () => { const d = new Date(); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const fmtMD = (ms) => { const d = new Date(ms); return `${d.getMonth() + 1}/${d.getDate()}`; };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 号機のタグ(HV=400V / D=Dアンプ駆動 / BL=バッテリーレス)。号機マスタ表と取り合いガントで共用。
const unitFlags = (c) => ({ hv: /400/.test(String(c && c.voltage || '')), d: !!(c && c.dDrive), bl: !!(c && c.batteryless) });
// バーが時間で重ならないように行(サブレーン)へ詰める。返り値: {bars:[{...,row}], rowCount}
function packRows(bars) {
  const rowsEnd = []; const out = [];
  for (const b of bars.slice().sort((x, y) => x.start - y.start || x.end - y.end)) {
    let r = rowsEnd.findIndex(end => b.start >= end);
    if (r === -1) { r = rowsEnd.length; rowsEnd.push(b.end); } else rowsEnd[r] = b.end;
    out.push({ ...b, row: r });
  }
  return { bars: out, rowCount: Math.max(1, rowsEnd.length) };
}

// ファイル(CSV)を文字化けせず読む: UTF-8で読み、置換文字があれば Shift_JIS で読み直す
async function readCsvSmart(file) {
  const buf = await file.arrayBuffer();
  let text = new TextDecoder('utf-8').decode(buf);
  if (text.includes('�')) { try { text = new TextDecoder('shift_jis').decode(buf); } catch (e) { /* keep utf8 */ } }
  return text;
}

// ═══════════════════════════════════════════════════════════
//  制御装置(号機)割当ビュー — ①割当ガント ②モーター登録 ③号機マスタ
// ═══════════════════════════════════════════════════════════
export function ControlDeviceView({ controllers = [], lots = [], orderMotors = [], motorLedger = [], spareMotors = [], saveData, deleteData, settings = {}, saveSettings, currentUserName = '' }) {
  const isAdmin = currentUserName === '管理者';
  const [sub, setSub] = useState('gantt');
  const [showLegend, setShowLegend] = useState(false);
  const leadDays = Number.isFinite(Number(settings.controlDeviceLeadDays)) ? Number(settings.controlDeviceLeadDays) : 3;
  const setLeadDays = (n) => saveSettings && saveSettings({ controlDeviceLeadDays: Math.max(0, Number(n) || 0) });

  // 号機マスタを正規化
  const ctls = useMemo(() => controllers.map(c => ({ ...CD.normController(c), id: c.id })), [controllers]);
  // D.D.モーター仕様表（Excel取込で settings.controlMotorSpecs に保存済み）。型式→モーター自動提案に使う。
  //  ⚠傾斜軸「(記載なし)」は回転軸と同一制御装置=units継承(清水指摘)。ここで一括継承し割当/提案/表示すべてに反映。
  const rawMotorSpecs = useMemo(() => Array.isArray(settings.controlMotorSpecs) ? settings.controlMotorSpecs : [], [settings.controlMotorSpecs]);
  const motorSpecs = useMemo(() => CD.withInheritedTiltUnits(rawMotorSpecs), [rawMotorSpecs]);
  // 取り合い(ガント)は「指図別モーター登録(order_motors)＝検査に来ない製品も含む全製品」を対象にする。
  //   納期は検査リスト(lots)から補完（同じ指図が検査リストにあれば、その納期を使う＝タイムラインに乗る）。
  const dueByOrder = useMemo(() => { const m = {}; for (const l of lots) { const o = String(l.orderNo || '').trim(); if (o && l.dueDate && !m[o]) m[o] = l.dueDate; } return m; }, [lots]);
  const allocItems = useMemo(() => (orderMotors || []).map(om => ({
    id: om.orderNo, orderNo: om.orderNo, model: om.model || '', quantity: om.quantity || 1,
    dueDate: om.dueDate || dueByOrder[String(om.orderNo)] || '',
    controlSpec: { axes: Array.isArray(om.axes) ? om.axes : [] },
  })), [orderMotors, dueByOrder]);
  // (D)アンプ例外号機(型式限定でDモーター可: 号機31/84×RTT-213/215等)。未設定なら既定を使う。
  const dAmpExceptions = Array.isArray(settings.controlDAmpExceptions) ? settings.controlDAmpExceptions : CD.DEFAULT_DAMP_EXCEPTIONS;
  // モーター一覧の上書き登録(自動判定の容量/電圧/HV/BL/D駆動/DDを訂正・FANUC以外の登録)。
  const motorOverrides = useMemo(() => Array.isArray(settings.motorOverrides) ? settings.motorOverrides : [], [settings.motorOverrides]);
  // 割当計算（全製品対象）。includeCompleted相当は不要（order_motorsはstatus無し＝全件対象）。
  const alloc = useMemo(() => CD.buildAllocation(allocItems, ctls, { leadDays, motorSpecs, dAmpExceptions, motorOverrides, includeCompleted: true }), [allocItems, ctls, leadDays, motorSpecs, dAmpExceptions, motorOverrides]);

  const TABS = [
    { id: 'gantt', label: '取り合いガント（全製品）', icon: AlertTriangle },
    { id: 'ordermotors', label: '指図モーター登録', icon: List },
    { id: 'ledger', label: '実績台帳（型式↔モーター↔号機）', icon: List },
    { id: 'spares', label: '仮モーター在庫（社内）', icon: Cpu },
    { id: 'motors', label: '検査ロットのモーター', icon: Cpu },
    { id: 'master', label: '号機マスタ', icon: Plus },
    { id: 'motormaster', label: 'モーター一覧（自動判定・上書き）', icon: Cpu },
    { id: 'motorspec', label: '型式とモーターの特別対応表', icon: List },
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 flex items-center gap-2 mb-2">
        <h2 className="text-lg font-black text-slate-800 flex items-center gap-2"><Cpu className="w-5 h-5 text-indigo-600" /> 制御装置（号機）割当</h2>
        <span className="text-[11px] text-slate-400">モーター型式から必要容量を出し、号機の取り合いを可視化します</span>
        <button onClick={() => setShowLegend(v => !v)}
          className={`ml-auto shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-bold border transition-colors ${showLegend ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-indigo-600 border-indigo-300 hover:bg-indigo-50'}`}
          title="HV・DD・D・-B・なめらか補正などのタグ／用語の意味と使い方">
          <Info className="w-4 h-4" /> タグ・用語の説明{showLegend ? 'を閉じる' : ''}
        </button>
      </div>
      <div className="shrink-0 flex gap-1 border-b border-slate-200 mb-3">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setSub(t.id)}
            className={`px-3 py-1.5 text-sm font-bold rounded-t-md border-b-2 flex items-center gap-1.5 transition-all ${sub === t.id ? 'border-indigo-600 text-indigo-600 bg-indigo-50' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}>
            <t.icon className="w-4 h-4" /> {t.label}
            {t.id === 'gantt' && alloc.conflicts.length > 0 && <span className="ml-1 bg-red-500 text-white text-[10px] font-black rounded-full px-1.5">{alloc.conflicts.length}</span>}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {showLegend && <TagLegend onClose={() => setShowLegend(false)} />}
        {ctls.length === 0 && sub !== 'master' && sub !== 'motorspec' && sub !== 'ordermotors' && sub !== 'ledger' && sub !== 'spares' && (
          <div className="text-center text-slate-400 py-10 text-sm">
            号機マスタが未登録です。「号機マスタ」タブで登録（生産課の制御装置Excel(.xls/.xlsx)取込も可）してください。
          </div>
        )}
        {sub === 'gantt' && ctls.length > 0 && <ContentionGantt alloc={alloc} items={allocItems} ctls={ctls} leadDays={leadDays} setLeadDays={setLeadDays} />}
        {sub === 'ordermotors' && <OrderMotorRegister orderMotors={orderMotors} motorLedger={motorLedger} saveData={saveData} deleteData={deleteData} isAdmin={isAdmin} dueByOrder={dueByOrder} />}
        {sub === 'ledger' && <MotorLedgerView ledger={motorLedger} orderMotors={orderMotors} dueByOrder={dueByOrder} saveData={saveData} deleteData={deleteData} isAdmin={isAdmin} />}
        {sub === 'spares' && <SpareMotorView spares={spareMotors} ctls={ctls} saveData={saveData} deleteData={deleteData} isAdmin={isAdmin} motorSpecs={motorSpecs} dAmpExceptions={dAmpExceptions} motorOverrides={motorOverrides} />}
        {sub === 'motors' && <MotorRegister lots={lots} ctls={ctls} saveData={saveData} leadDays={leadDays} motorSpecs={motorSpecs} dAmpExceptions={dAmpExceptions} motorOverrides={motorOverrides} />}
        {sub === 'motormaster' && <MotorMasterView orderMotors={orderMotors} motorSpecs={rawMotorSpecs} overrides={motorOverrides} saveSettings={saveSettings} isAdmin={isAdmin} />}
        {sub === 'master' && <ControllerMaster ctls={ctls} saveData={saveData} deleteData={deleteData} isAdmin={isAdmin} saveSettings={saveSettings} motorSpecs={motorSpecs} rawSpecs={rawMotorSpecs} dAmpExceptions={dAmpExceptions} />}
        {sub === 'motorspec' && <MotorSpecTable motorSpecs={motorSpecs} rawSpecs={rawMotorSpecs} ctls={ctls} saveSettings={saveSettings} isAdmin={isAdmin} />}
      </div>
    </div>
  );
}

// ───────── 指図モーター登録（検査リスト非依存・貼り付け一括） ─────────
function OrderMotorRegister({ orderMotors = [], motorLedger = [], saveData, deleteData, isAdmin, dueByOrder = {} }) {
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');
  const fileRef = useRef(null);
  const sanId = (o) => String(o).replace(/[\/.#$\[\]]/g, '_');
  const sorted = useMemo(() => {
    const t = String(q || '').trim().toUpperCase();
    const hit = (o) => !t || [o.orderNo, o.model, ...((o.axes || []).map(a => a.model))].some(v => String(v || '').toUpperCase().includes(t));
    return [...orderMotors].filter(hit).sort((a, b) => String(a.orderNo).localeCompare(String(b.orderNo)));
  }, [orderMotors, q]);

  const upsert = async (rows, src) => {
    let n = 0; const today = todayYmd();
    const ledgerById = {}; for (const l of (motorLedger || [])) ledgerById[String(l.orderNo)] = l;
    for (const r of rows) {
      const om = { orderNo: r.orderNo, model: r.model, quantity: r.quantity, axes: r.axes, dueDate: r.dueDate || '', source: src };
      await saveData('order_motors', sanId(r.orderNo), om);
      // 実績台帳(別枠DB)にも追記＝型式↔モーター↔指図↔日付。全削除しても消えない。モーター軸が有る行だけ。
      //   既存があれば日付は既存を保持(空を渡してmergeで温存)、手入力の号機実績(usedUnits)も温存(ledgerRecordが空なら載せない)。
      const ex = ledgerById[String(r.orderNo)];
      const led = CD.ledgerRecordFromOrderMotor(om, (ex && ex.date) ? '' : today);
      if (led && led.axes.length) await saveData('motor_ledger', sanId(r.orderNo), led);
      n++;
    }
    return n;
  };
  const deleteAll = async () => {
    if (!isAdmin) return;
    if (!confirm(`指図モーター登録を全部（${orderMotors.length}件）削除しますか？\n※ 実績台帳（型式↔モーター↔指図↔日付）は別枠に残ります。`)) return;
    for (const o of orderMotors) { await deleteData('order_motors', o.id || sanId(o.orderNo)); }
    setMsg('指図モーター登録を全削除しました（実績台帳は残っています）。');
  };

  const doRegister = async () => {
    const rows = CD.parseOrderMotorText(text);
    if (!rows.length) { setMsg('登録できる行がありません（列＝指図/型式/台数/回転軸/傾斜軸/基準日・タブ区切り推奨）。'); return; }
    const n = await upsert(rows, 'paste');
    setMsg(`${n}件を登録（追記・同じ指図は上書き）しました。`); setText('');
  };
  const removeOne = (o) => { if (confirm(`指図 ${o} のモーター登録を削除しますか？`)) deleteData('order_motors', sanId(o)); };

  // Excel雛形DL（今の登録内容＋ヘッダ）→ 編集 → アップロードで登録
  const downloadXlsx = async () => {
    const XLSX = await loadXLSX();
    const header = ['指図', '型式', '台数', '回転軸', '傾斜軸', '基準日'];
    const aoa = [header, ...sorted.map(o => {
      const rot = (o.axes || []).find(a => a.label === '回転軸') || (o.axes || [])[0];
      const tilt = (o.axes || []).find(a => a.label === '傾斜軸') || (o.axes || [])[1];
      return [o.orderNo, o.model, o.quantity, rot ? rot.model : '', tilt ? tilt.model : '', o.dueDate || dueByOrder[String(o.orderNo)] || ''];
    })];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 14 }, { wch: 22 }, { wch: 6 }, { wch: 28 }, { wch: 28 }, { wch: 12 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '指図モーター');
    const d = new Date(); const p = n => String(n).padStart(2, '0');
    XLSX.writeFile(wb, `指図モーター_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.xlsx`);
  };
  const uploadXlsx = async (e) => {
    const file = e.target.files && e.target.files[0]; e.target.value = '';
    if (!file) return;
    try {
      const XLSX = await loadXLSX();
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      const grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
      const fmt = (c) => { if (c instanceof Date) { const p = n => String(n).padStart(2, '0'); return `${c.getFullYear()}/${p(c.getMonth() + 1)}/${p(c.getDate())}`; } return String(c == null ? '' : c); };
      const asText = grid.map(r => r.map(fmt).join('\t')).join('\n');
      const rows = CD.parseOrderMotorText(asText);
      if (!rows.length) { setMsg('取込できる行がありません（列＝指図/型式/台数/回転軸/傾斜軸/基準日）。'); return; }
      const n = await upsert(rows, 'excel');
      setMsg(`Excelから ${n}件を登録しました。`);
    } catch (err) { setMsg('取込エラー: ' + (err.message || err)); }
  };

  return (
    <div>
      <div className="text-[12px] text-slate-500 mb-2 flex items-center gap-1"><Info className="w-3.5 h-3.5" />
        検査リストに関係なく、全製品の指図×モーターを登録します（取り合いガントの対象＝ここ）。検査に来ない製品もここに入れると「真の取り合い」が見えます。納期は同じ指図が検査リストにあればそこから自動補完されます。
      </div>
      {isAdmin && (
        <div className="mb-3">
          <div className="text-[11px] text-slate-500 mb-1">下の表(指図 / 型式 / 台数 / 回転軸 / 傾斜軸)をコピーして貼り付け → 一括登録。タブ区切り（Excel/表からのコピー）でOK。</div>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={6} placeholder={'1001475775\tRCV-1000R\t1\tαiF22/3000/αiA1000\t\n1001488065\tTBS-160,H\t1\tαiS2/5000-B/αIA4000\tαiS4/5000-B/αiA4000'} className="w-full border rounded p-2 text-[12px] font-mono" />
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <button onClick={doRegister} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm font-bold flex items-center gap-1.5"><Upload className="w-4 h-4" /> 貼り付けを一括登録</button>
            <span className="text-slate-300">|</span>
            <button onClick={downloadXlsx} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm font-bold flex items-center gap-1.5"><Download className="w-4 h-4" /> Excelでダウンロード</button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={uploadXlsx} />
            <button onClick={() => fileRef.current && fileRef.current.click()} className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-sm font-bold flex items-center gap-1.5"><Upload className="w-4 h-4" /> Excelをアップロード登録</button>
            {msg && <span className="text-sm text-emerald-700">{msg}</span>}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Excelは列＝指図/型式/台数/回転軸/傾斜軸/基準日。ダウンロード→編集→アップロードで往復。基準日がガントのタイムライン位置になります。</div>
        </div>
      )}
      {!isAdmin && <div className="mb-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">登録・削除は管理者のみ（閲覧中）。</div>}

      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <span className="text-[12px] font-bold text-slate-600">登録済み {sorted.length}件（納期あり {sorted.filter(o => (o.dueDate || dueByOrder[String(o.orderNo)])).length}件）</span>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="検索（指図/型式/モーター）" className="border rounded px-2 py-1 text-[12px] w-52" />
        {isAdmin && sorted.length > 0 && (
          <button onClick={deleteAll} className="ml-auto px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded text-[12px] font-bold flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> 全削除</button>
        )}
      </div>
      {isAdmin && <div className="text-[10px] text-slate-400 mb-1">「全削除」は指図モーター登録だけを消します。型式↔モーター↔指図↔日付の<b>実績台帳は別枠に残る</b>ので、モーター未登録の製品でも過去実績＝使う号機の参考が出続けます。</div>}
      <div className="border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-[12px] whitespace-nowrap">
          <thead className="bg-slate-100 text-slate-500"><tr>
            <th className="p-2 text-left">指図</th><th className="p-2 text-left">型式</th><th className="p-2 text-center">台数</th><th className="p-2 text-left">回転軸</th><th className="p-2 text-left">傾斜軸</th><th className="p-2 text-left">納期</th><th className="p-2"></th>
          </tr></thead>
          <tbody>
            {sorted.map(o => {
              const rot = (o.axes || []).find(a => a.label === '回転軸') || (o.axes || [])[0];
              const tilt = (o.axes || []).find(a => a.label === '傾斜軸') || (o.axes || [])[1];
              const due = o.dueDate || dueByOrder[String(o.orderNo)] || '';
              return (
                <tr key={o.orderNo} className="border-t border-slate-100 hover:bg-indigo-50/30">
                  <td className="p-2 font-bold text-slate-700">{o.orderNo}</td>
                  <td className="p-2 text-slate-500">{o.model}</td>
                  <td className="p-2 text-center text-slate-500">{o.quantity}</td>
                  <td className="p-2 text-slate-600 font-mono text-[11px]">{rot ? rot.model : ''}</td>
                  <td className="p-2 text-slate-600 font-mono text-[11px]">{tilt ? tilt.model : ''}</td>
                  <td className={`p-2 text-[11px] ${due ? 'text-slate-500' : 'text-slate-300'}`}>{due || '未定'}</td>
                  <td className="p-2 text-right">{isAdmin && <button onClick={() => removeOne(o.orderNo)} className="text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5 inline" /></button>}</td>
                </tr>
              );
            })}
            {sorted.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-slate-400">指図モーターが未登録です。上のテキスト欄に表を貼り付けて「一括登録」。</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ───────── 実績台帳（型式↔モーター↔号機↔指図↔日付の別枠DB。全削除でも残る。月/窓で見る・個別編集/削除） ─────────
function MotorLedgerView({ ledger = [], orderMotors = [], dueByOrder = {}, saveData, deleteData, isAdmin }) {
  const sanId = (o) => String(o).replace(/[\/.#$\[\]]/g, '_');
  const now = new Date(); const p2 = n => String(n).padStart(2, '0');
  const curMonth = `${now.getFullYear()}-${p2(now.getMonth() + 1)}`;
  const today = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`;
  const [mode, setMode] = useState('month');
  const [month, setMonth] = useState(curMonth);
  const [refDate, setRefDate] = useState(today);
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');

  const inRange = (dateStr) => {
    if (!dateStr) return true; // 日付なしは常に表示(消して見えなくならないように=編集/削除の導線を残す)
    if (mode === 'month') return String(dateStr).slice(0, 7) === month;
    const d = new Date(dateStr + 'T00:00:00'); if (isNaN(d.getTime())) return false;
    const start = new Date(refDate + 'T00:00:00'); start.setDate(start.getDate() - 7);
    const end = new Date(refDate + 'T00:00:00'); end.setMonth(end.getMonth() + 1);
    return d >= start && d <= end;
  };
  const rows = useMemo(() => {
    const t = String(q || '').trim().toUpperCase();
    const hit = (r) => !t || [r.orderNo, r.model, ...((r.axes || []).map(a => a.motorModel)), ...((r.usedUnits || []).map(u => u.unit))].some(v => String(v || '').toUpperCase().includes(t));
    return [...ledger].filter(r => inRange(r.date) && hit(r)).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(a.orderNo).localeCompare(String(b.orderNo)));
  }, [ledger, mode, month, refDate, q]);
  const allMonths = useMemo(() => [...new Set(ledger.map(r => String(r.date || '').slice(0, 7)).filter(Boolean))].sort().reverse(), [ledger]);

  const seedFromOrderMotors = async () => {
    if (!isAdmin) return;
    if (!confirm(`現在の指図モーター登録（${orderMotors.length}件）を実績台帳に取り込みますか？（既存の日付・手入力の号機実績は保持します）`)) return;
    let n = 0;
    const byId = {}; for (const l of (ledger || [])) byId[String(l.orderNo)] = l;
    for (const o of orderMotors) {
      const ex = byId[String(o.orderNo)];
      const date = (ex && ex.date) ? '' : (o.dueDate || dueByOrder[String(o.orderNo)] || today);
      const led = CD.ledgerRecordFromOrderMotor(o, date);
      if (led && led.axes.length) { await saveData('motor_ledger', sanId(o.orderNo), led); n++; }
    }
    setMsg(`${n}件を台帳へ取り込みました。`);
  };
  const removeOne = (r) => { if (confirm(`台帳から 指図 ${r.orderNo}（${r.model}）を削除しますか？`)) deleteData('motor_ledger', r.id || sanId(r.orderNo)); };
  const startEdit = (r) => { setEditId(r.id); setDraft({ ...r, axes: (r.axes || []).map(a => ({ ...a })), usedText: (r.usedUnits || []).map(u => `${u.label || ''}:${u.unit}`).join(', ') }); };
  const cancelEdit = () => { setEditId(null); setDraft(null); };
  const setAxis = (i, patch) => setDraft(d => ({ ...d, axes: d.axes.map((a, ai) => ai === i ? { ...a, ...patch } : a) }));
  const saveEdit = async () => {
    if (!draft) return;
    const usedUnits = String(draft.usedText || '').split(',').map(s => s.trim()).filter(Boolean).map(s => { const [a, b] = s.split(':'); return b ? { label: a.trim(), unit: b.trim() } : { label: '', unit: a.trim() }; });
    const rec = { orderNo: draft.orderNo, model: draft.model || '', date: draft.date || '', axes: (draft.axes || []).map(a => ({ label: a.label || '', motorModel: a.motorModel || '', capacity: a.capacity || '', voltage: a.voltage || '' })), usedUnits, source: draft.source || 'manual' };
    await saveData('motor_ledger', draft.id || sanId(draft.orderNo), rec);
    setMsg(`指図 ${draft.orderNo} を更新しました。`); cancelEdit();
  };

  return (
    <div>
      <div className="text-[12px] text-slate-500 mb-2 flex items-center gap-1"><Info className="w-3.5 h-3.5 shrink-0" />
        型式↔モーター↔号機↔指図↔日付を貯めておく<b>別枠の台帳</b>です。指図モーター登録すると自動で追記され、<b>「全削除」しても消えません</b>。モーター未登録の製品でも、ここから「過去このモーター/号機で回した」＝仮モーターの手配先が分かります。
      </div>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <div className="inline-flex rounded-md border border-slate-300 overflow-hidden text-[12px] font-bold">
          <button onClick={() => setMode('month')} className={`px-2.5 py-1 ${mode === 'month' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'}`}>月で見る</button>
          <button onClick={() => setMode('window')} className={`px-2.5 py-1 border-l border-slate-300 ${mode === 'window' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'}`}>窓（1週間前〜1ヶ月後）</button>
        </div>
        {mode === 'month'
          ? <select value={month} onChange={e => setMonth(e.target.value)} className="border rounded px-2 py-1 text-[12px]">
              {[curMonth, ...allMonths.filter(m => m !== curMonth)].map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          : <label className="text-[12px] text-slate-500 flex items-center gap-1">基準日<input type="date" value={refDate} onChange={e => setRefDate(e.target.value)} className="border rounded px-2 py-1 text-[12px]" /></label>}
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="検索（指図/型式/モーター/号機）" className="border rounded px-2 py-1 text-[12px] w-56" />
        <span className="text-[12px] font-bold text-slate-600">{rows.length}件</span>
        {isAdmin && <button onClick={seedFromOrderMotors} className="ml-auto px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded text-[12px] font-bold flex items-center gap-1"><Download className="w-3.5 h-3.5" /> 現在の指図登録を台帳へ取り込み</button>}
      </div>
      {msg && <div className="text-[12px] text-emerald-700 mb-1">{msg}</div>}
      <div className="border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-[12px] whitespace-nowrap">
          <thead className="bg-slate-100 text-slate-500"><tr>
            <th className="p-2 text-left">日付</th><th className="p-2 text-left">指図</th><th className="p-2 text-left">型式</th><th className="p-2 text-left">モーター（軸ごと）</th><th className="p-2 text-left">号機実績</th><th className="p-2"></th>
          </tr></thead>
          <tbody>
            {rows.map(r => editId === r.id ? (
              <tr key={r.id} className="border-t border-slate-100 bg-amber-50/40">
                <td colSpan={6} className="p-2">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <label className="text-[11px] text-slate-500 flex items-center gap-1">日付<input type="date" value={draft.date || ''} onChange={e => setDraft(d => ({ ...d, date: e.target.value }))} className="border rounded px-1.5 py-0.5" /></label>
                    <span className="text-[11px] text-slate-500">指図 <b>{draft.orderNo}</b></span>
                    <label className="text-[11px] text-slate-500 flex items-center gap-1">型式<input value={draft.model || ''} onChange={e => setDraft(d => ({ ...d, model: e.target.value }))} className="border rounded px-1.5 py-0.5 w-40" /></label>
                  </div>
                  {(draft.axes || []).map((a, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-1.5 mb-1">
                      <input value={a.label || ''} onChange={e => setAxis(i, { label: e.target.value })} placeholder="軸" className="border rounded px-1.5 py-0.5 w-16 text-[11px]" />
                      <input value={a.motorModel || ''} onChange={e => setAxis(i, { motorModel: e.target.value })} placeholder="モーター型式" className="border rounded px-1.5 py-0.5 w-52 font-mono text-[11px]" />
                      <input value={a.capacity || ''} onChange={e => setAxis(i, { capacity: e.target.value })} placeholder="容量" className="border rounded px-1.5 py-0.5 w-16 text-[11px]" />
                      <input value={a.voltage || ''} onChange={e => setAxis(i, { voltage: e.target.value })} placeholder="電圧" className="border rounded px-1.5 py-0.5 w-20 text-[11px]" />
                    </div>
                  ))}
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <label className="text-[11px] text-slate-500 flex items-center gap-1">号機実績<input value={draft.usedText || ''} onChange={e => setDraft(d => ({ ...d, usedText: e.target.value }))} placeholder="回転軸:33, 傾斜軸:33" className="border rounded px-1.5 py-0.5 w-56 text-[11px]" /></label>
                    <button onClick={saveEdit} className="px-2.5 py-1 bg-indigo-600 text-white rounded text-[12px] font-bold flex items-center gap-1"><Check className="w-3.5 h-3.5" />保存</button>
                    <button onClick={cancelEdit} className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded text-[12px] font-bold">取消</button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={r.id} className="border-t border-slate-100 hover:bg-indigo-50/30 align-top">
                <td className="p-2 text-slate-500">{r.date || '—'}</td>
                <td className="p-2 font-bold text-slate-700">{r.orderNo}</td>
                <td className="p-2 text-slate-600">{r.model}</td>
                <td className="p-2">
                  <div className="flex flex-col gap-0.5">
                    {(r.axes || []).map((a, i) => (
                      <span key={i} className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-400 w-12">{a.label || `軸${i + 1}`}</span>
                        <span className="font-mono text-[11px] text-slate-700">{a.motorModel || '—'}</span>
                        {a.capacity && <span className="text-[10px] font-bold bg-slate-100 rounded px-1">{a.capacity}</span>}
                        <MTag model={a.motorModel} />
                      </span>
                    ))}
                  </div>
                </td>
                <td className="p-2 text-slate-500">{(r.usedUnits || []).length ? (r.usedUnits || []).map(u => `${u.label ? u.label + ':' : ''}${u.unit}`).join(' / ') : '—'}</td>
                <td className="p-2 text-right">{isAdmin && <span className="inline-flex gap-1.5"><button onClick={() => startEdit(r)} className="text-slate-400 hover:text-indigo-600"><Pencil className="w-3.5 h-3.5 inline" /></button><button onClick={() => removeOne(r)} className="text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5 inline" /></button></span>}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-400">この期間の台帳データはありません。{isAdmin ? '「現在の指図登録を台帳へ取り込み」で貯め始められます。' : ''}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ───────── 仮モーター在庫（社内: 検査G/組立Gが持つ予備モーター）。登録すると準備カードに「社内の仮モーターで回せる」が出る ─────────
function SpareMotorView({ spares = [], ctls = [], saveData, deleteData, isAdmin, motorSpecs = [], dAmpExceptions = [], motorOverrides = [] }) {
  const opts = { motorSpecs, dAmpExceptions, motorOverrides };
  const sanId = (s) => String(s).replace(/[\/.#$\[\]]/g, '_').slice(0, 100);
  const keyOf = (model, group) => sanId(model || '') + '__G__' + sanId(group || ''); // 型式・グループを個別にsanIdして結合(区切り衝突防止)
  const [draft, setDraft] = useState({ motorModel: '', capacity: '', voltage: '', group: '検査', qty: 1, note: '' });
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');

  const add = async () => {
    const model = String(draft.motorModel || '').trim();
    if (!model) { setMsg('モーター型式を入力してください。'); return; }
    const rec = { motorModel: model, capacity: draft.capacity || '', voltage: draft.voltage || '', group: draft.group || '', qty: Number(draft.qty) || 1, note: draft.note || '' };
    // 同一型式・同一グループが既にあれば「本数を加算」(黙って上書きして1本目を消さない=清水のデータ保護)。
    const dupe = spares.find(x => String(x.motorModel || '') === model && String(x.group || '') === rec.group);
    if (dupe) {
      if (!confirm(`同じ型式・グループが既に登録済みです（現在${dupe.qty || 1}本）。本数を +${rec.qty} しますか？（キャンセルで中止）`)) return;
      await saveData('spare_motors', dupe.id || keyOf(model, rec.group), { qty: (Number(dupe.qty) || 1) + rec.qty });
      setMsg(`${model}（${rec.group}）の本数を ${(Number(dupe.qty) || 1) + rec.qty} に更新しました。`);
    } else {
      await saveData('spare_motors', keyOf(model, rec.group), rec);
      setMsg(`${model}（${rec.group}）を登録しました。`);
    }
    setDraft({ motorModel: '', capacity: '', voltage: '', group: draft.group, qty: 1, note: '' });
  };
  const remove = (s) => { if (confirm(`仮モーター ${s.motorModel}（${s.group}）を削除しますか？`)) deleteData('spare_motors', s.id || keyOf(s.motorModel, s.group)); };
  // ⚠変更フィールドだけ merge 送信(全フィールドを stale クロージャから書き戻さない=連続blurのクロッバー防止)。
  const patch = (s, p) => saveData('spare_motors', s.id || keyOf(s.motorModel, s.group), p);

  const nk = (s) => String(s || '').toUpperCase();
  const rows = useMemo(() => {
    const t = nk(q.trim());
    return [...spares].filter(s => !t || nk(s.motorModel).includes(t) || nk(s.group).includes(t) || nk(s.note).includes(t))
      .sort((a, b) => String(a.group).localeCompare(String(b.group)) || String(a.motorModel).localeCompare(String(b.motorModel)));
  }, [spares, q]);

  return (
    <div>
      <div className="text-[12px] text-slate-500 mb-2 flex items-center gap-1"><Info className="w-3.5 h-3.5 shrink-0" />
        社内（検査G/組立G）が持っている<b>予備モーター</b>を登録します。登録すると、モーターが付いていない指図でも作業画面の準備カードに<b>「社内の仮モーター ○○ で回せる（号機△）」</b>が出ます（回せないモーターは出しません）。
      </div>
      {isAdmin && (
        <div className="mb-3 border border-slate-200 rounded-lg p-2 bg-slate-50">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[11px] text-slate-500 flex flex-col">モーター型式<input value={draft.motorModel} onChange={e => setDraft(d => ({ ...d, motorModel: e.target.value }))} placeholder="αiS8/4000-D" className="border rounded px-2 py-1 w-52 font-mono text-[12px]" /></label>
            <label className="text-[11px] text-slate-500 flex flex-col">容量<select value={draft.capacity} onChange={e => setDraft(d => ({ ...d, capacity: e.target.value }))} className="border rounded px-2 py-1 text-[12px]">{CAP_OPTS.map(c => <option key={c || '_'} value={c}>{c || '（自動）'}</option>)}</select></label>
            <label className="text-[11px] text-slate-500 flex flex-col">電圧<select value={draft.voltage} onChange={e => setDraft(d => ({ ...d, voltage: e.target.value }))} className="border rounded px-2 py-1 text-[12px]"><option value="">（自動）</option><option value="AC200V">200V</option><option value="AC400V">400V(HV)</option></select></label>
            <label className="text-[11px] text-slate-500 flex flex-col">グループ<input value={draft.group} onChange={e => setDraft(d => ({ ...d, group: e.target.value }))} list="spareGroups" className="border rounded px-2 py-1 w-24 text-[12px]" /><datalist id="spareGroups"><option value="検査" /><option value="組立" /></datalist></label>
            <label className="text-[11px] text-slate-500 flex flex-col">本数<input type="number" min={1} value={draft.qty} onChange={e => setDraft(d => ({ ...d, qty: e.target.value }))} className="border rounded px-2 py-1 w-16 text-[12px]" /></label>
            <label className="text-[11px] text-slate-500 flex flex-col flex-1 min-w-[8rem]">備考<input value={draft.note} onChange={e => setDraft(d => ({ ...d, note: e.target.value }))} className="border rounded px-2 py-1 text-[12px]" /></label>
            <button onClick={add} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm font-bold flex items-center gap-1.5"><Plus className="w-4 h-4" /> 追加</button>
          </div>
          {msg && <div className="text-[12px] text-emerald-700 mt-1">{msg}</div>}
        </div>
      )}
      {!isAdmin && <div className="mb-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">登録・編集は管理者のみ（閲覧中）。</div>}
      <div className="flex items-center gap-2 mb-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="検索（型式/グループ/備考）" className="border rounded px-2 py-1 text-[12px] w-64" />
        <span className="text-[12px] font-bold text-slate-600">{rows.length}件</span>
      </div>
      <div className="border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-[12px] whitespace-nowrap">
          <thead className="bg-slate-100 text-slate-500"><tr>
            <th className="p-2 text-left">モーター型式</th><th className="p-2 text-left">自動判定</th><th className="p-2 text-center">本数</th><th className="p-2 text-left">グループ</th><th className="p-2 text-left">回せる号機</th><th className="p-2 text-left">備考</th><th className="p-2"></th>
          </tr></thead>
          <tbody>
            {rows.map(s => {
              const auto = CD.autoMotorAttrs(s.motorModel);
              const cap = CD.normCap(s.capacity) || auto.capacity || '?';
              const units = CD.usableUnitsForMotor(ctls, '', s.motorModel, opts, s.voltage, s.capacity);
              return (
                <tr key={s.id || keyOf(s.motorModel, s.group)} className="border-t border-slate-100 hover:bg-indigo-50/30">
                  <td className="p-2 font-mono text-slate-700">{s.motorModel}<MTag model={s.motorModel} /></td>
                  <td className="p-2 text-[11px] text-slate-500">{cap} / {s.voltage ? (CD.is400V(s.voltage) ? '400V' : '200V') : (auto.voltage === '400V' ? '400V(HV)' : (auto.voltage || '—'))}</td>
                  <td className="p-2 text-center">{isAdmin ? <input key={'q' + (s.qty || 1)} type="number" min={1} defaultValue={s.qty || 1} onBlur={e => { const v = Number(e.target.value) || 1; if (v !== (s.qty || 1)) patch(s, { qty: v }); }} className="border rounded px-1 py-0.5 w-14 text-center" /> : (s.qty || 1)}</td>
                  <td className="p-2"><span className="bg-emerald-600 text-white rounded px-1.5 py-0.5 text-[11px] font-bold">{s.group || '—'}</span></td>
                  <td className="p-2 text-slate-600">{units.length ? units.join(', ') : <span className="text-rose-500">回せる号機なし</span>}</td>
                  <td className="p-2 text-slate-500">{isAdmin ? <input key={'n' + (s.note || '')} defaultValue={s.note || ''} onBlur={e => { if (e.target.value !== (s.note || '')) patch(s, { note: e.target.value }); }} className="border rounded px-1.5 py-0.5 w-40" placeholder="備考" /> : s.note}</td>
                  <td className="p-2 text-right">{isAdmin && <button onClick={() => remove(s)} className="text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5 inline" /></button>}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-slate-400">{q ? '該当なし。' : '仮モーターが未登録です。上のフォームで社内の予備モーターを登録してください。'}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 号機タグ(HV/D/BL)チップ・モータータグ(HV/DD)チップ
const UTag = ({ f }) => (<>
  {f.hv && <span className="ml-0.5 bg-orange-500 text-white text-[8px] font-black px-1 rounded align-middle">HV</span>}
  {f.d && <span className="ml-0.5 bg-purple-500 text-white text-[8px] font-black px-1 rounded align-middle">D</span>}
  {f.bl && <span className="ml-0.5 bg-cyan-500 text-white text-[8px] font-black px-1 rounded align-middle">BL</span>}
</>);
const MTag = ({ model }) => (<>
  {CD.isHV(model) && <span className="ml-0.5 bg-orange-400 text-white text-[8px] font-black px-1 rounded align-middle" title="HV=400V。400Vの号機のみ(200V号機に載せると焼損)">HV</span>}
  {CD.isDD(model) && <span className="ml-0.5 bg-teal-500 text-white text-[8px] font-black px-1 rounded align-middle" title="DD=直駆動(Dis/TSUDA)。DD表の駆動可能号機のみ">DD</span>}
  {CD.isDAmp(model) && <span className="ml-0.5 bg-purple-500 text-white text-[8px] font-black px-1 rounded align-middle" title="Dモーター=(D)アンプ専用。200Vは号機32・400Vは号機35(電圧一致必須)">D</span>}
  {/* -Bタグは「割当に影響するときだけ」出す＝直駆動(DD)の-Bのみ(号機32〜35=-B用なめらか補正○が要る)。
      普通モーターの-B(例: αiF30/4000-B)は αi-Bシリーズ世代の表記で号機選定に影響しないので、
      誤解を招く制約風タグは出さない(清水指摘: 意味のないタグは付けるな)。 */}
  {CD.isBMotor(model) && CD.isDD(model) && <span className="ml-0.5 bg-fuchsia-600 text-white text-[8px] font-black px-1 rounded align-middle" title="-B付きDD＝サーボ版数の要件。「-B用なめらか補正」○の号機(32〜35)のみで回せる。※普通モーターの-B(αi-Bシリーズ世代)は号機選定に影響しないため非表示">-B</span>}
</>);
const axShort = (label) => label === '回転軸' ? '回' : label === '傾斜軸' ? '傾' : (label || '');

// ───────── タグ・用語の説明（凡例）: 画面上部から開閉。制御装置まわりの用語を1か所に集約 ─────────
// 表示チップは実際の MTag / UTag / モーター一覧の色と合わせる（見た瞬間に同じものだと分かるように）。
const TagLegend = ({ onClose }) => {
  const Chip = ({ cls, children }) => (
    <span className={`inline-block ${cls} text-white text-[10px] font-black px-1.5 py-0.5 rounded align-middle`}>{children}</span>
  );
  // 1項目 = チップ + 意味 + 使い方（どの号機に載る／どう決まる）
  const Row = ({ chip, title, children }) => (
    <div className="flex gap-2 py-2 border-t border-slate-100 first:border-t-0">
      <div className="shrink-0 w-16 pt-0.5 text-center">{chip}</div>
      <div className="min-w-0 text-[12px] leading-relaxed text-slate-600">
        <span className="font-bold text-slate-800">{title}</span><br />{children}
      </div>
    </div>
  );
  const Sec = ({ title, note, children }) => (
    <div className="mb-3">
      <div className="text-[12px] font-black text-indigo-700 mb-1 flex items-baseline gap-2">{title}{note && <span className="text-[10px] font-normal text-slate-400">{note}</span>}</div>
      <div className="bg-white rounded-lg border border-slate-200 px-3 py-1">{children}</div>
    </div>
  );
  return (
    <div className="mb-4 rounded-xl border-2 border-indigo-200 bg-indigo-50/40 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Info className="w-4 h-4 text-indigo-600" />
        <span className="text-sm font-black text-slate-800">タグ・用語の説明</span>
        <span className="text-[11px] text-slate-400">「回せる号機」を間違えるとモーター/アンプを焼くので、意味と使い方をここにまとめました</span>
        <button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-5">
        <div>
          <Sec title="① モーターのタグ" note="モーター型式から自動で付く（一覧・ガント・登録の各所）">
            <Row chip={<Chip cls="bg-orange-400">HV</Chip>} title="HV＝400V（ハイボルテージ）">
              <b>400Vの号機のみ</b>で回せます。<b className="text-rose-600">200Vの号機に載せると焼損</b>。400Vは同じ番手でも電流が半分（例：200Vで20A → 400Vなら10A）。※号機側のHVタグは「その号機が400V」の意味。
            </Row>
            <Row chip={<Chip cls="bg-teal-500">DD</Chip>} title="DD＝直駆動（Dis／津田駒）">
              「型式とモーターの特別対応表」の<b>駆動可能号機だけ</b>に載ります。傾斜軸が「(記載なし)」なら<b>回転軸と同じ号機を継承</b>。表に型式が無いと②「使える号機なし」に出ます。
            </Row>
            <Row chip={<Chip cls="bg-purple-500">D</Chip>} title="D＝(D)アンプ専用（型式末尾 -D）">
              (D)アンプの軸を持つ号機だけ。<b>200Vは号機32／400Vは号機35</b>（電圧一致必須）。改造の型式限定例外は<b>「(D)アンプ例外号機」設定</b>で追加（既定：号機31・84 × RTT-213/215）。普通モーターとは同じ軸に同居しません（排他）。
            </Row>
            <Row chip={<Chip cls="bg-fuchsia-600">-B</Chip>} title="-B＝αi-Bシリーズ世代の表記">
              型式末尾の -B は<b>FANUC「αi-Bシリーズ」世代</b>の表記（αiF□-B／αiS□-B。FANUC資料で確認）。<b className="text-rose-600">直駆動(DD)の -B のときだけ</b>「-B用なめらか補正」○の号機（32〜35）が必要です（サーボ版数の要件）。<b>普通モーターの -B（例：αiF30/4000-B）は号機選定に影響しない</b>ので、<b>-Bタグは DD のときだけ表示</b>します（普通モーターには出しません＝意味のないタグを付けない）。割当は電圧＋容量で決まります。
            </Row>
            <Row chip={<Chip cls="bg-cyan-500">BL</Chip>} title="BL＝バッテリーレスエンコーダ">
              型式に「数字＋BL」（例：αiA1000<b>BL</b>）が付くもの。<b>バッテリーレス対応の号機だけ</b>に載ります。
            </Row>
          </Sec>

          <Sec title="② 号機のタグ" note="号機マスタの属性（ガント／表の号機側）">
            <Row chip={<Chip cls="bg-orange-500">HV</Chip>} title="この号機は 400V">400VのモーターのみOK（200Vモーターは不可）。</Row>
            <Row chip={<Chip cls="bg-purple-500">D</Chip>} title="この号機は (D)アンプ軸を持つ">-Dモーターを載せられる号機（32／35）。</Row>
            <Row chip={<Chip cls="bg-cyan-500">BL</Chip>} title="この号機はバッテリーレス対応">BL必須モーターを載せられる号機。</Row>
          </Sec>
        </div>

        <div>
          <Sec title="③ 号機マスタの列（なめらか補正）" note="DDを回せるか／-B付きDDを回せるか">
            <Row chip={<span className="text-teal-600 font-black text-lg">○</span>} title="なめらか補正">
              <b>DDモーターを回せる号機なら自動で○</b>（18号機以上／サーボ版数90C5相当以上を導出。<b>保存はしない表示だけ</b>）。
            </Row>
            <Row chip={<span className="text-emerald-600 font-black text-lg">○</span>} title="-B用なめらか補正（実欄・真実の源）">
              <b>-B付きDDモーター（DIS80/400HV-B 等）を回せる号機のみ○</b>。Excelの実欄＝これが唯一の判断根拠（版数90J0相当以上）。実データで○＝<b>号機32・33・34・35</b>。
            </Row>
          </Sec>

          <Sec title="④ 取り合いガントの見方">
            <div className="text-[12px] leading-relaxed text-slate-600 py-1 space-y-1.5">
              <div><b className="text-slate-800">号機別ビュー</b>：どの号機を どの指図が取り合うか（<b className="text-rose-600">赤＝重複期間</b>）。取り合いはここで見えます。</div>
              <div><b className="text-slate-800">指図別ビュー</b>：各指図がいつ・どの号機を占有するか。バーの表記 <b>「号機33(両軸)」</b>＝1台で両軸／<b>「回:31 傾:82」</b>＝軸ごと別号機。</div>
              <div><b className="text-slate-800">印刷／Excel</b>：<b>今見ているビューをそのまま出力</b>します（指図別で押せば指図別ガント、号機別なら号機別）。Excelは日付グリッドで色を塗って共有できます。</div>
              <div><b className="text-slate-800">両軸</b>：回転軸・傾斜軸を<b>同じ号機で回せる</b>状態（1台で足りる＝望ましい）。</div>
              <div><b className="text-rose-600">使える号機なし</b>：電圧／容量／DD表未記載などで、その指図を載せられる号機が1台も無い。②の一覧に理由付きで出ます。</div>
            </div>
          </Sec>

          <Sec title="⑤ 割当の絶対ルール（焼損防止）">
            <div className="text-[12px] leading-relaxed text-slate-600 py-1 space-y-1">
              <div><b className="text-rose-600">1. 電圧</b>：200V↔400V(HV)を跨いだ割当は<b>物理的に焼損</b>＝最優先で除外（他の条件より強い）。</div>
              <div><b>2. 容量</b>：号機の軸アンペア <b>≧</b> モーター必要アンペア（HVは電流が半分）。</div>
              <div><b>3. 排他</b>：(D)アンプ軸に普通モーターは同居しない。DD／-Dは別概念（混同すると誤割当）。</div>
              <div className="text-slate-400 text-[11px] pt-0.5">※タグや号機が間違っていたら「モーター一覧（自動判定・上書き）」「型式とモーターの特別対応表」「号機マスタ」で直せます。直すと割当に即反映されます。</div>
            </div>
          </Sec>
        </div>
      </div>
    </div>
  );
};

// ───────── ① 取り合いガント（号機別レーン＝どの号機を どの指図が取り合うか） ─────────
function ContentionGantt({ alloc, items, ctls, leadDays, setLeadDays }) {
  const { assignments, conflicts, contentions = [], scarceNeeds, ampleNeeds } = alloc;
  const today = CD.ymdToMs(todayYmd());
  const [view, setView] = useState('unit'); // 'unit'=号機別（取り合いが見える） / 'order'=指図別

  // ── 指図ごとの占有窓（納期-リード 〜 納期）。指図別ビュー＆日付軸の範囲に使う。
  const dated = [], undated = [];
  for (const it of items) {
    if (!(it.controlSpec && Array.isArray(it.controlSpec.axes) && it.controlSpec.axes.length)) continue;
    const due = CD.ymdToMs(it.dueDate);
    if (due == null) { undated.push(it); continue; }
    const lead = Math.max(0, Number((it.controlSpec.leadDays != null) ? it.controlSpec.leadDays : leadDays) || 0);
    dated.push({ it, start: due - lead * DAY_MS, end: due, due });
  }
  dated.sort((a, b) => a.due - b.due || String(a.it.orderNo).localeCompare(String(b.it.orderNo)));

  // ── 号機マスタ引き当て・割当/取り合いのインデックス
  const ctlByUnit = {}; for (const c of ctls) ctlByUnit[String(c.unit)] = c;
  const asgByUnit = {}; for (const a of assignments) (asgByUnit[String(a.unit)] = asgByUnit[String(a.unit)] || []).push(a);
  const blkByUnit = {}; for (const c of contentions) (blkByUnit[String(c.unit)] = blkByUnit[String(c.unit)] || []).push(c);
  const asgByOrder = {}; for (const a of assignments) (asgByOrder[a.orderNo] = asgByOrder[a.orderNo] || []).push(a);

  // ── 取り合い明細（重複排除）：①号機の取り合い ②使える号機なし
  const contMap = new Map();
  for (const c of contentions) { const k = c.unit + '|' + c.blocked.orderNo + '|' + c.blocker.orderNo; if (!contMap.has(k)) contMap.set(k, c); }
  const contList = [...contMap.values()].sort((a, b) => a.overlapStart - b.overlapStart);
  const noResMap = new Map();
  for (const cf of conflicts) for (const u of cf.unmet) if (!(u.rivals && u.rivals.length)) {
    const k = cf.orderNo + '|' + CD.needTypeLabel(u.need) + '|' + (u.need?.model || ''); // 同一指図内の別モーター(-D2軸等)が1行に潰れないようmodelもキーへ
    if (!noResMap.has(k)) noResMap.set(k, { orderNo: cf.orderNo, model: cf.model, due: cf.due, start: cf.start, end: cf.end, label: CD.needTypeLabel(u.need), motor: u.need.model || '', qualifyingCount: u.qualifyingCount, need: u.need });
  }
  const noResource = [...noResMap.values()];
  // バナー/バッジは「何件の指図が問題か」で数える（明細行数=ペア数ではなく指図数で一致させる）
  const contOrders = new Set(contList.map(c => c.blocked.orderNo));
  const noResOrders = new Set(noResource.map(n => n.orderNo));

  // 指図→取り合い状況（指図別ビューのバー表示に使う）
  const orderCont = {};
  for (const c of contList) { (orderCont[c.blocked.orderNo] = orderCont[c.blocked.orderNo] || { units: new Set(), noRes: false }).units.add(c.unit); }
  for (const n of noResource) { (orderCont[n.orderNo] = orderCont[n.orderNo] || { units: new Set(), noRes: false }).noRes = true; }

  // ── 表示範囲（割当・取り合い・指図窓の全部を内包）
  const wins = [];
  for (const a of assignments) { wins.push(a.start, a.end); }
  for (const c of contentions) { wins.push(c.blocked.start, c.blocked.end); }
  for (const d of dated) { wins.push(d.start, d.end); }
  let hStart = today, hEnd = today + 7 * DAY_MS;
  if (wins.length) { hStart = Math.min(today, ...wins); hEnd = Math.max(today, ...wins); }
  hStart -= DAY_MS; hEnd += DAY_MS;
  const span = Math.max(DAY_MS, hEnd - hStart);
  const xPct = (ms) => ((ms - hStart) / span) * 100;
  const dayCount = Math.max(1, Math.round(span / DAY_MS));
  const dayW = 100 / dayCount;
  const step = dayCount > 90 ? 14 : (dayCount > 45 ? 7 : (dayCount > 20 ? 2 : 1));
  const ticks = []; for (let t = hStart; t <= hEnd; t += DAY_MS * step) ticks.push(t);

  // 取り合いの重複期間（赤バンド）
  const days = []; for (let t = hStart; t <= hEnd; t += DAY_MS) days.push(t);
  const redDays = days.filter(d => contList.some(c => d >= c.overlapStart - DAY_MS / 2 && d <= c.overlapEnd + DAY_MS / 2));

  const printPdf = () => printAllocation(alloc, ctls, leadDays, view);
  const exportExcel = async () => {
    const XLSX = await loadXLSX();
    const wb = XLSX.utils.book_new();
    const uTags = (u) => { const c = ctlByUnit[String(u)] || {}; const f = unitFlags(c); return [f.hv ? 'HV' : '', f.d ? 'D' : '', f.bl ? 'BL' : ''].filter(Boolean).join('/'); };
    // ★ 指図別タイムライン（画面の「指図別」ガントと同じ・日付グリッド。Excelで色付け調整して共有できる）
    const tlHeader = ['指図', '型式', '納期', '状態', '割当号機', ...days.map(d => fmtMD(d))];
    const tlRows = dated.map(d => {
      const oc = orderCont[d.it.orderNo]; const asg = asgByOrder[d.it.orderNo] || [];
      const units = [...new Set(asg.map(a => String(a.unit)))];
      const state = oc ? (oc.noRes ? '使える号機なし' : '取り合い') : '割当';
      const assignTxt = oc ? (oc.noRes ? '—' : ('取り合い:号機' + [...(oc.units || [])].join(','))) : (units.length === 1 ? `号機${units[0]}(両軸)` : asg.map(a => `${axShort(a.need && a.need.label)}:${a.unit}`).join(' '));
      const fill = oc ? (oc.noRes ? '×なし' : '取合') : (units.length === 1 ? units[0] : units.join('/'));
      const cells = days.map(day => (day >= d.start - DAY_MS / 2 && day <= d.end + DAY_MS / 2) ? fill : '');
      return [d.it.orderNo, d.it.model, CD.msToYmd(d.due), state, assignTxt, ...cells];
    });
    const wsTL = XLSX.utils.aoa_to_sheet([tlHeader, ...tlRows]);
    wsTL['!cols'] = [12, 20, 12, 12, 18, ...days.map(() => 5)].map(wch => ({ wch }));
    XLSX.utils.book_append_sheet(wb, wsTL, '指図別タイムライン');
    // ① 指図別割当（軸→号機・両軸集約が分かる）
    const s1 = [['指図', '型式', '台数', '納期', '状態', '軸→号機', '号機タグ']];
    for (const d of dated) {
      const oc = orderCont[d.it.orderNo]; const asg = asgByOrder[d.it.orderNo] || [];
      const units = [...new Set(asg.map(a => String(a.unit)))];
      const state = oc ? (oc.noRes ? '使える号機なし' : '取り合い') : '割当';
      const axMap = oc ? (oc.noRes ? '—' : ('取り合い:号機' + [...(oc.units || [])].join(','))) : (units.length === 1 ? `号機${units[0]}(両軸)` : asg.map(a => `${axShort(a.need && a.need.label)}:${a.unit}`).join(' '));
      s1.push([d.it.orderNo, d.it.model, d.it.quantity, CD.msToYmd(d.due), state, axMap, units.map(uTags).filter(Boolean).join(' ')]);
    }
    const ws1 = XLSX.utils.aoa_to_sheet(s1); ws1['!cols'] = [12, 20, 6, 12, 14, 20, 10].map(wch => ({ wch })); XLSX.utils.book_append_sheet(wb, ws1, '指図別割当');
    // ② 号機の取り合い
    const s2 = [['号機', '号機タグ', '先に押さえた指図', '納期', '置けなかった指図', '納期', '重複期間', '軸/モーター']];
    for (const c of contList) s2.push(['号機' + c.unit, uTags(c.unit), c.blocker.orderNo, CD.msToYmd(c.blocker.due), c.blocked.orderNo, CD.msToYmd(c.blocked.due), `${CD.msToYmd(c.overlapStart)}〜${CD.msToYmd(c.overlapEnd)}`, `${axShort(c.need && c.need.label)} ${c.need && c.need.model || ''}`]);
    const ws2 = XLSX.utils.aoa_to_sheet(s2); ws2['!cols'] = [8, 10, 14, 12, 14, 12, 20, 26].map(wch => ({ wch })); XLSX.utils.book_append_sheet(wb, ws2, '①号機の取り合い');
    // ③ 使える号機なし（理由＋推奨号機）
    const s3 = [['指図', '型式', '納期', '必要スペック', 'モーター', '理由', '推奨号機']];
    for (const n of noResource) {
      const diag = n.need ? CD.unitDiagnostics(n.need, ctls) : { voltageDrop: [], servoWarn: [] };
      const sug = n.need ? CD.suggestDdUnits(n.need, ctls) : [];
      const reason = [diag.voltageDrop.length ? '電圧除外:' + diag.voltageDrop.join(',') : '', diag.servoWarn.length ? '回せない:' + diag.servoWarn.join(',') : ''].filter(Boolean).join(' / ');
      s3.push([n.orderNo, n.model, CD.msToYmd(n.due), n.label, n.motor, reason || '該当スペックの号機なし', sug.join(',')]);
    }
    const ws3 = XLSX.utils.aoa_to_sheet(s3); ws3['!cols'] = [12, 20, 12, 24, 26, 26, 12].map(wch => ({ wch })); XLSX.utils.book_append_sheet(wb, ws3, '②使える号機なし');
    XLSX.writeFile(wb, `制御装置_取り合い_${todayYmd()}.xlsx`);
  };
  const LABEL_W = 'w-52';
  const ROW = 22; // 1バー行の高さ(px)

  // レーン対象号機 = 割当があるか・取り合いのある号機。号機番号順。
  const laneUnits = [...new Set([...Object.keys(asgByUnit), ...Object.keys(blkByUnit)])]
    .sort((x, y) => (Number(x) - Number(y)) || x.localeCompare(y));

  const DateHeader = () => (
    <div className="flex items-stretch border-b border-slate-200 bg-slate-50 sticky top-0 z-10">
      <div className={`${LABEL_W} shrink-0 px-2 py-1 text-[11px] font-bold text-slate-500 border-r border-slate-200`}>{view === 'unit' ? '号機（制御装置）' : '指図 / 型式 / モーター'}</div>
      <div className="relative flex-1 h-7">
        {redDays.map((d, i) => <div key={'r' + i} className="absolute inset-y-0 bg-red-300/40" style={{ left: `${xPct(d)}%`, width: `${dayW}%` }} />)}
        {ticks.map((t, i) => (<div key={i} className="absolute top-0 bottom-0 border-l border-slate-200 text-[9px] text-slate-400 pl-0.5" style={{ left: `${xPct(t)}%` }}>{fmtMD(t)}</div>))}
        <div className="absolute top-0 bottom-0 border-l-2 border-blue-500" style={{ left: `${xPct(today)}%` }} title="今日" />
      </div>
    </div>
  );

  return (
    <div>
      {/* ヘッダ操作 */}
      <div className="flex flex-wrap items-center gap-3 mb-2 text-sm">
        <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden">
          <button onClick={() => setView('unit')} className={`px-3 py-1.5 text-sm font-bold ${view === 'unit' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>号機別（取り合いが見える）</button>
          <button onClick={() => setView('order')} className={`px-3 py-1.5 text-sm font-bold border-l border-slate-300 ${view === 'order' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>指図別</button>
        </div>
        <label className="flex items-center gap-1 text-slate-600">リード日数(納期の何日前から押さえる)
          <input type="number" min="0" max="30" value={leadDays} onChange={e => setLeadDays(e.target.value)} className="w-14 border rounded px-1.5 py-0.5 text-center" /> 日
        </label>
        <div className="ml-auto flex gap-2">
          <button onClick={exportExcel} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold flex items-center gap-1.5"><Download className="w-4 h-4" /> Excel書き出し</button>
          <button onClick={printPdf} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-800 text-white rounded font-bold flex items-center gap-1.5"><Printer className="w-4 h-4" /> PDF・印刷</button>
        </div>
      </div>

      {/* 取り合いバナー：2種類を分けて表示（号機の取り合い / 使える号機なし）。件数＝影響する指図の数。 */}
      <div className="mb-2 grid gap-2 sm:grid-cols-2">
        <div className={`rounded-lg border-2 px-3 py-2 text-sm font-bold flex items-center gap-2 ${contOrders.size ? 'border-red-300 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>① 号機の取り合い <b className="text-base">{contOrders.size}</b>件の指図<br /><span className="text-[11px] font-normal">同じ号機を複数の指図が同じ時期に奪い合い（下の①表で相手を確認）</span></span>
        </div>
        <div className={`rounded-lg border-2 px-3 py-2 text-sm font-bold flex items-center gap-2 ${noResOrders.size ? 'border-rose-400 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>② 使える号機が無い <b className="text-base">{noResOrders.size}</b>件の指図<br /><span className="text-[11px] font-normal">そのモーターを動かせる号機が1台も無い（取り合い以前の問題）</span></span>
        </div>
      </div>

      {/* 号機タイプ別 過不足サマリ（0台＝使える号機なし と 不足＝取り合い を区別） */}
      <div className="mb-3 flex flex-wrap gap-2 text-[12px]">
        {scarceNeeds.map(t => (
          <span key={t.key} className={`rounded px-2 py-1 font-bold border ${t.qualifyingCount === 0 ? 'bg-rose-100 border-rose-300 text-rose-700' : t.qualifyingCount < t.demandCount ? 'bg-red-100 border-red-300 text-red-700' : 'bg-amber-50 border-amber-300 text-amber-700'}`}>
            {t.label}：使える号機 <b>{t.qualifyingCount}台</b> / 要求 {t.demandCount}件 {t.qualifyingCount === 0 ? '← 使える号機なし' : t.qualifyingCount < t.demandCount ? '← 取り合い' : ''}
          </span>
        ))}
        {ampleNeeds.map(t => (<span key={t.key} className="rounded px-2 py-1 font-bold border bg-emerald-50 border-emerald-200 text-emerald-700">{t.label}：{t.qualifyingCount}台（余裕）</span>))}
      </div>

      {/* ═══ 号機別ビュー ═══ */}
      {view === 'unit' && ((laneUnits.length === 0 && noResource.length === 0) ? (
        <div className="text-center text-slate-400 py-8 text-sm">割り当てられた号機がありません（納期のあるモーター登録が無い）。</div>
      ) : (
        <div className="border border-slate-200 rounded-lg overflow-x-auto">
          <div className="min-w-[760px]">
            <DateHeader />
            {laneUnits.map(uk => {
              const c = ctlByUnit[uk] || { unit: uk, voltage: '', dDrive: false, batteryless: false, cnc: '' };
              const f = unitFlags(c);
              const asgs = (asgByUnit[uk] || []).map(a => ({ ...a, motor: (a.need && a.need.model) || '' }));
              const packed = packRows(asgs);
              const blocked = blkByUnit[uk] || [];
              const asgH = packed.rowCount * ROW;
              const blkH = blocked.length ? ROW + 4 : 0;
              const laneH = asgH + blkH + 6;
              return (
                <div key={uk} className="flex items-stretch border-b border-slate-100 hover:bg-indigo-50/20">
                  <div className={`${LABEL_W} shrink-0 px-2 py-1.5 border-r border-slate-200 text-[11px]`}>
                    <div className="font-black text-slate-700">号機{c.unit}<UTag f={f} /></div>
                    <div className="text-[10px] text-slate-400 truncate">{c.cnc || ''}{c.voltage ? ' / ' + (CD.is400V(c.voltage) ? '400V(HV)' : '200V') : ''}{c.servo ? ' / ' + c.servo : ''}</div>
                    {blocked.length > 0 && <div className="text-[10px] font-bold text-red-600">⚠取り合い {blocked.length}件</div>}
                  </div>
                  <div className="relative flex-1" style={{ height: laneH }}>
                    {redDays.map((rd, i) => <div key={'rd' + i} className="absolute inset-y-0 bg-red-200/30" style={{ left: `${xPct(rd)}%`, width: `${dayW}%` }} />)}
                    <div className="absolute top-0 bottom-0 border-l border-blue-300/60" style={{ left: `${xPct(today)}%` }} />
                    {/* 割当バー（この号機が動かす指図） */}
                    {packed.bars.map((a, i) => {
                      const left = xPct(a.start), width = Math.max(dayW, xPct(a.end) - xPct(a.start));
                      const urgent = a.due <= today + 2 * DAY_MS;
                      return (
                        <div key={'a' + i} title={`号機${c.unit}: 指図${a.orderNo} ${a.model} / モーター ${a.motor} ${axShort(a.need && a.need.label)}軸 / ${CD.msToYmd(a.start).slice(5)}〜${CD.msToYmd(a.end).slice(5)}`}
                          className={`absolute rounded text-[9px] text-white font-bold px-1 overflow-hidden whitespace-nowrap flex items-center gap-0.5 ${urgent ? 'bg-orange-500' : 'bg-indigo-500'}`}
                          style={{ left: `${left}%`, width: `${width}%`, top: 3 + a.row * ROW, height: ROW - 3 }}>
                          <span className="truncate">{a.orderNo}</span><span className="opacity-80 truncate">{a.motor}</span><MTag model={a.motor} />
                        </div>
                      );
                    })}
                    {/* 取り合いバー（この号機を欲しかったが置けなかった指図＝赤・重複期間を濃く） */}
                    {blocked.map((b, i) => {
                      const bl = xPct(b.blocked.start), bw = Math.max(dayW, xPct(b.blocked.end) - xPct(b.blocked.start));
                      const ol = xPct(b.overlapStart), ow = Math.max(dayW, xPct(b.overlapEnd) - xPct(b.overlapStart));
                      return (
                        <div key={'b' + i}>
                          <div title={`取り合い: 号機${c.unit} を 指図${b.blocker.orderNo}(先約) と 指図${b.blocked.orderNo} が ${CD.msToYmd(b.overlapStart).slice(5)}〜${CD.msToYmd(b.overlapEnd).slice(5)} で奪い合い`}
                            className="absolute rounded text-[9px] text-white font-bold px-1 overflow-hidden whitespace-nowrap flex items-center bg-red-500 border border-red-700"
                            style={{ left: `${bl}%`, width: `${bw}%`, top: asgH + 2, height: ROW }}>
                            ⚠{b.blocked.orderNo}↔{b.blocker.orderNo}(先約)
                          </div>
                          <div className="absolute bg-red-600/70" style={{ left: `${ol}%`, width: `${ow}%`, top: asgH + 2, height: ROW }} title="重複（この期間が奪い合い）" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {/* 使える号機なし＝置ける号機ゼロの指図を専用レーンで表示（ガントだけ見ても②が視認できる） */}
            {noResource.filter(n => n.start != null && n.end != null).length > 0 && (() => {
              const packed = packRows(noResource.filter(n => n.start != null && n.end != null));
              const h = packed.rowCount * ROW + 6;
              return (
                <div className="flex items-stretch border-b border-slate-100 bg-rose-50/50">
                  <div className={`${LABEL_W} shrink-0 px-2 py-1.5 border-r border-slate-200 text-[11px]`}>
                    <div className="font-black text-rose-700">使える号機なし</div>
                    <div className="text-[10px] text-rose-500">動かせる号機ゼロ {noResOrders.size}件</div>
                  </div>
                  <div className="relative flex-1" style={{ height: h }}>
                    <div className="absolute top-0 bottom-0 border-l border-blue-300/60" style={{ left: `${xPct(today)}%` }} />
                    {packed.bars.map((n, i) => {
                      const left = xPct(n.start), width = Math.max(dayW, xPct(n.end) - xPct(n.start));
                      return (
                        <div key={'nr' + i} title={`使える号機なし: 指図${n.orderNo} ${n.model} / ${n.label} / モーター${n.motor} / 納期${CD.msToYmd(n.due)}`}
                          className="absolute rounded text-[9px] text-white font-bold px-1 overflow-hidden whitespace-nowrap flex items-center gap-0.5 bg-rose-600 border border-rose-800"
                          style={{ left: `${left}%`, width: `${width}%`, top: 3 + n.row * ROW, height: ROW - 3 }}>
                          <span className="truncate">⚠{n.orderNo}</span><span className="opacity-80 truncate">{n.motor}</span><MTag model={n.motor} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      ))}

      {/* ═══ 指図別ビュー ═══ */}
      {view === 'order' && (dated.length === 0 ? (
        <div className="text-center text-slate-400 py-8 text-sm">納期のある指図がありません。指図モーター登録に納期（検査リストの入庫/納期）が無いとタイムラインに乗りません。</div>
      ) : (
        <div className="border border-slate-200 rounded-lg overflow-x-auto">
          <div className="min-w-[760px]">
            <DateHeader />
            {dated.map(d => {
              const oc = orderCont[d.it.orderNo];
              const conf = !!oc;
              const asg = asgByOrder[d.it.orderNo] || [];
              const units = [...new Set(asg.map(a => a.unit))];
              // 軸ごとの割当先(回:31 傾:82 …)。同じ号機に集約できたら1つにまとめる。
              const perAxis = asg.map(a => ({ label: axShort(a.need && a.need.label), unit: String(a.unit) }));
              const urgent = d.due <= today + 2 * DAY_MS;
              const left = xPct(d.start), width = Math.max(dayW, xPct(d.end) - xPct(d.start));
              const axes = (d.it.controlSpec && d.it.controlSpec.axes) || [];
              const barText = conf
                ? (oc.noRes ? '使える号機なし' : (oc.units.size ? '号機' + [...oc.units].join(',') + 'を取り合い' : '取り合い'))
                : (units.length === 1 ? '号機' + units[0] + '（両軸）' : (perAxis.length ? perAxis.map(p => `${p.label}:${p.unit}`).join(' ') : (units.length ? '号機' + units.join(',') : '')));
              return (
                <div key={d.it.orderNo} className="flex items-stretch border-b border-slate-100 hover:bg-indigo-50/30">
                  <div className={`${LABEL_W} shrink-0 px-2 py-1.5 border-r border-slate-200 text-[11px]`}>
                    <div className="font-black text-slate-700">{d.it.orderNo}{conf && <span className="ml-1 text-red-600">⚠</span>} <span className="text-[10px] font-normal text-slate-400">{CD.msToYmd(d.due).slice(5)}</span></div>
                    <div className="text-slate-500 truncate">{d.it.model} <span className="text-slate-400">×{d.it.quantity}</span></div>
                    {axes.map((a, i) => (<div key={i} className="text-[10px] font-mono text-slate-400 truncate">{axShort(a.label)}:{a.model}<MTag model={a.model} /></div>))}
                    {!conf && perAxis.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {units.length === 1
                          ? (() => { const c = ctlByUnit[units[0]] || {}; return <span className="inline-flex items-center text-[10px] bg-indigo-50 text-indigo-700 rounded px-1 font-bold">号機{units[0]}（両軸）<UTag f={unitFlags(c)} /></span>; })()
                          : perAxis.map((p, i) => { const c = ctlByUnit[p.unit] || {}; return <span key={i} className="inline-flex items-center text-[10px] bg-indigo-50 text-indigo-700 rounded px-1 font-bold">{p.label}→{p.unit}<UTag f={unitFlags(c)} /></span>; })}
                      </div>
                    )}
                  </div>
                  <div className="relative flex-1 min-h-[3rem]">
                    {redDays.map((rd, i) => <div key={'rd' + i} className="absolute inset-y-0 bg-red-200/30" style={{ left: `${xPct(rd)}%`, width: `${dayW}%` }} />)}
                    <div className="absolute top-0 bottom-0 border-l border-blue-300/60" style={{ left: `${xPct(today)}%` }} />
                    <div title={`${d.it.orderNo} ${d.it.model} / 納期${CD.msToYmd(d.due)}${conf ? ' / ' + barText : units.length ? ' / 号機' + units.join(',') : ''}`}
                      className={`absolute top-1.5 bottom-1.5 rounded text-[9px] text-white font-bold px-1.5 overflow-hidden whitespace-nowrap flex items-center ${conf ? (oc.noRes ? 'bg-rose-600' : 'bg-red-500') : urgent ? 'bg-orange-500' : 'bg-indigo-500'}`}
                      style={{ left: `${left}%`, width: `${width}%` }}>
                      {barText}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* 凡例 */}
      <div className="mt-2 text-[10px] text-slate-400 flex flex-wrap gap-x-3 gap-y-0.5">
        <span><span className="inline-block w-3 h-2 bg-indigo-500 rounded-sm align-middle" /> 割当（正常）</span>
        <span><span className="inline-block w-3 h-2 bg-orange-500 rounded-sm align-middle" /> 納期2日以内</span>
        <span><span className="inline-block w-3 h-2 bg-red-500 rounded-sm align-middle" /> 号機の取り合い</span>
        <span><span className="inline-block w-3 h-2 bg-rose-600 rounded-sm align-middle" /> 使える号機なし</span>
        <span className="text-orange-600 font-bold">HV</span>=400V／<span className="text-purple-600 font-bold">D</span>=Dアンプ／<span className="text-cyan-600 font-bold">BL</span>=ﾊﾞｯﾃﾘｰﾚｽ／<span className="text-teal-600 font-bold">DD</span>=DDモーター
        <span><span className="text-blue-500 font-bold">│</span>今日</span>
      </div>

      {/* ═══ 取り合い明細（どの号機を・誰と誰が） ═══ */}
      {(contList.length > 0 || noResource.length > 0) && (
        <div className="mt-4 space-y-3">
          {contList.length > 0 && (
            <div>
              <div className="text-[13px] font-black text-red-700 mb-1 flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> ① 号機の取り合い {contList.length}件（同じ号機を奪い合い）</div>
              <div className="overflow-x-auto border border-red-200 rounded-lg">
                <table className="w-full text-[11px]">
                  <thead className="bg-red-50 text-red-700"><tr>
                    <th className="px-2 py-1 text-left">号機</th><th className="px-2 py-1 text-left">先に押さえた指図</th><th className="px-2 py-1 text-left">置けなかった指図</th><th className="px-2 py-1 text-left">重複期間</th><th className="px-2 py-1 text-left">軸/モーター</th>
                  </tr></thead>
                  <tbody>
                    {contList.map((c, i) => {
                      const cf = ctlByUnit[String(c.unit)] || {};
                      return (
                        <tr key={i} className="border-t border-red-100">
                          <td className="px-2 py-1 font-black whitespace-nowrap">号機{c.unit}<UTag f={unitFlags(cf)} /></td>
                          <td className="px-2 py-1 whitespace-nowrap">{c.blocker.orderNo} <span className="text-slate-400">({CD.msToYmd(c.blocker.due).slice(5)}納期)</span></td>
                          <td className="px-2 py-1 whitespace-nowrap font-bold text-red-700">{c.blocked.orderNo} <span className="text-slate-400 font-normal">({CD.msToYmd(c.blocked.due).slice(5)}納期)</span></td>
                          <td className="px-2 py-1 whitespace-nowrap">{CD.msToYmd(c.overlapStart).slice(5)}〜{CD.msToYmd(c.overlapEnd).slice(5)}</td>
                          <td className="px-2 py-1 whitespace-nowrap">{axShort(c.need && c.need.label)} {c.need && c.need.model}<MTag model={c.need && c.need.model} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {noResource.length > 0 && (
            <div>
              <div className="text-[13px] font-black text-rose-700 mb-1 flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> ② 使える号機が無い {noResource.length}件（そのモーターを動かせる号機が1台も無い）</div>
              <div className="overflow-x-auto border border-rose-200 rounded-lg">
                <table className="w-full text-[11px]">
                  <thead className="bg-rose-50 text-rose-700"><tr>
                    <th className="px-2 py-1 text-left">指図</th><th className="px-2 py-1 text-left">型式</th><th className="px-2 py-1 text-left">納期</th><th className="px-2 py-1 text-left">必要スペック</th><th className="px-2 py-1 text-left">モーター</th><th className="px-2 py-1 text-left">理由 / 推奨号機</th>
                  </tr></thead>
                  <tbody>
                    {noResource.map((n, i) => {
                      const diag = n.need ? CD.unitDiagnostics(n.need, ctls) : { voltageDrop: [], servoWarn: [] };
                      const suggest = n.need ? CD.suggestDdUnits(n.need, ctls) : [];
                      return (
                      <tr key={i} className="border-t border-rose-100">
                        <td className="px-2 py-1 font-bold whitespace-nowrap">{n.orderNo}</td>
                        <td className="px-2 py-1 whitespace-nowrap">{n.model}</td>
                        <td className="px-2 py-1 whitespace-nowrap">{CD.msToYmd(n.due).slice(5)}</td>
                        <td className="px-2 py-1 whitespace-nowrap font-bold text-rose-700">{n.label}</td>
                        <td className="px-2 py-1 whitespace-nowrap">{n.motor}<MTag model={n.motor} /></td>
                        <td className="px-2 py-1">
                          {(diag.voltageDrop.length > 0 || diag.servoWarn.length > 0) ? (
                            <div className="flex flex-col gap-0.5">
                              {diag.voltageDrop.length > 0 && <span className="text-[10px] text-orange-700">⚡電圧不一致で除外: 号機{diag.voltageDrop.join(',')}</span>}
                              {diag.servoWarn.length > 0 && <span className="text-[10px] text-fuchsia-700">⚙回せない号機: {diag.servoWarn.join(',')}（{n.need && n.need.isB ? '-Bは「-B用なめらか補正」○の号機' : 'DD対応(90C5相当)以上'}が必要）</span>}
                              {suggest.length > 0
                                ? <span className="text-[10px] font-bold text-emerald-700">→ 推奨号機: {suggest.join(',')}（DD表を修正）</span>
                                : <span className="text-[10px] text-slate-400">→ 物理的に回せる号機が見つかりません</span>}
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400">{n.need && (n.need.dAmp ? '(D)アンプ機に空き無し' : n.need.dd ? 'DD表に駆動可能号機なし' : '該当スペックの号機なし')}</span>
                          )}
                        </td>
                      </tr>
                    ); })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 納期未定（登録のみ・タイムライン外） */}
      {undated.length > 0 && (
        <div className="mt-4">
          <div className="text-[12px] font-bold text-slate-600 mb-1">納期未定の登録 {undated.length}件（納期が無いため タイムライン・過不足サマリのどちらにも入りません。基準日/納期を入れると反映されます）</div>
          <div className="flex flex-wrap gap-1.5">
            {undated.slice(0, 60).map(it => (<span key={it.orderNo} className="text-[10px] bg-slate-100 rounded px-1.5 py-0.5 text-slate-500">{it.orderNo} <span className="text-slate-400">{it.model}×{it.quantity}</span></span>))}
            {undated.length > 60 && <span className="text-[10px] text-slate-400">…他{undated.length - 60}件</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ───────── ② モーター登録（指図ごと） ─────────
function MotorRegister({ lots, ctls, saveData, leadDays, motorSpecs = [], dAmpExceptions, motorOverrides }) {
  const active = useMemo(() => (lots || [])
    .filter(l => l.status !== 'completed' && l.location !== 'completed')
    .filter(l => l.orderNo)
    .sort((a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999'))), [lots]);
  const [editId, setEditId] = useState(null);

  return (
    <div>
      <div className="text-[12px] text-slate-500 mb-2 flex items-center gap-1"><Info className="w-3.5 h-3.5" /> 指図にモーター型式を登録すると、番手から必要容量を自動判定します（HV＝400V半額コード・DDは手入力）。2軸テーブルは「+軸」で2軸ぶん。</div>
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-500 text-[11px]">
            <tr><th className="p-2 text-left">指図</th><th className="p-2 text-left">型式</th><th className="p-2 text-left">納期</th><th className="p-2 text-left">登録モーター / 必要容量</th><th className="p-2 text-center">使える号機</th><th className="p-2"></th></tr>
          </thead>
          <tbody>
            {active.map(lot => {
              const needs = CD.lotAxisNeeds(lot, motorSpecs, { dAmpExceptions, motorOverrides });
              return (
                <React.Fragment key={lot.id}>
                  <tr className="border-t border-slate-100 align-top">
                    <td className="p-2 font-bold text-slate-700">{lot.orderNo}</td>
                    <td className="p-2 text-slate-500">{lot.model}</td>
                    <td className="p-2 text-slate-500">{lot.dueDate || '—'}</td>
                    <td className="p-2">
                      {needs.length === 0 ? <span className="text-slate-300">未登録</span> : (
                        <div className="flex flex-wrap gap-1">
                          {needs.map((n, i) => (
                            <span key={i} className="bg-slate-100 rounded px-1.5 py-0.5 text-[11px]">
                              {n.model || '—'} → {n.dAmp
                                ? <b className="text-purple-700">(D)ｱﾝﾌﾟ専用</b>
                                : <b className={n.capacity ? 'text-indigo-700' : 'text-red-500'}>{n.capacity || '容量?'}</b>}
                              {CD.is400V(n.voltage) && <span className="text-orange-600"> 400V</span>}
                              {n.dd && <span className="text-teal-600"> DD</span>}
                              {n.dAmp && <span className="text-purple-600"> D</span>}
                              {n.batteryless && <span className="text-cyan-600"> BL</span>}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="p-2 text-center">
                      {needs.length > 0 && (() => {
                        const counts = needs.map(n => CD.qualifyingControllers(ctls, n).length);
                        const min = Math.min(...counts);
                        return <span className={`font-black ${min === 0 ? 'text-red-600' : min >= 4 ? 'text-emerald-600' : 'text-amber-600'}`}>{min}台{min >= 4 ? '（余裕）' : min === 0 ? '（無し!）' : '（希少）'}</span>;
                      })()}
                    </td>
                    <td className="p-2 text-right">
                      <button onClick={() => setEditId(editId === lot.id ? null : lot.id)} className="text-indigo-600 hover:text-indigo-800 text-xs font-bold flex items-center gap-1"><Pencil className="w-3.5 h-3.5" />{editId === lot.id ? '閉じる' : '編集'}</button>
                    </td>
                  </tr>
                  {editId === lot.id && (
                    <tr className="bg-indigo-50/40"><td colSpan={6} className="p-3">
                      <MotorEditor lot={lot} saveData={saveData} onDone={() => setEditId(null)} leadDays={leadDays} motorSpecs={motorSpecs} />
                    </td></tr>
                  )}
                </React.Fragment>
              );
            })}
            {active.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-400">対象の指図（進行中・納期あり）がありません。</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MotorEditor({ lot, saveData, onDone, leadDays, motorSpecs = [] }) {
  const init = (lot.controlSpec && Array.isArray(lot.controlSpec.axes) && lot.controlSpec.axes.length)
    ? lot.controlSpec.axes.map(a => ({
        model: a.model || '', capacity: a.capacity || '', voltage: a.voltage || '', batteryless: !!a.batteryless,
        // D駆動((D)ｱﾝﾌﾟ)手動フラグ。レガシー a.dd=true は「直駆動(Dis/DD表)でなければ旧UIのD駆動チェックの意図」として引き継ぐ。
        //   ※motorSpecs未ロード(空)時はレガシー再解釈を保留(誤ってdAmp化して保存しないため)。
        dAmpManual: a.dAmp != null ? !!a.dAmp
          : ((motorSpecs.length && a.dd === true && !CD.isDD(a.model) && !CD.findMotorSpecByModel(a.model, motorSpecs)) ? true : null),
      }))
    : [{ model: '', capacity: '', voltage: '', batteryless: false, dAmpManual: null }];
  const [axes, setAxes] = useState(init);
  const [lead, setLead] = useState(lot.controlSpec && lot.controlSpec.leadDays != null ? lot.controlSpec.leadDays : '');
  const set = (i, patch) => setAxes(prev => prev.map((a, j) => j === i ? { ...a, ...patch } : a));
  const suggestions = useMemo(() => CD.suggestMotorAxes(lot.model, motorSpecs), [lot.model, motorSpecs]);
  const applySuggest = () => setAxes(suggestions.map(s => ({ model: s.model, capacity: s.capacity, voltage: s.voltage || '', batteryless: false, dAmpManual: null })));

  const save = () => {
    const cleaned = axes.filter(a => a.model.trim() || a.capacity).map((a, i) => ({
      model: a.model.trim(),
      capacity: a.capacity || undefined,          // 空なら型式番手で自動
      voltage: a.voltage || undefined,            // 明示400V(HV名に無い場合の保険)
      dAmp: a.dAmpManual != null ? a.dAmpManual : undefined, // (D)ｱﾝﾌﾟ必須。直駆動(dd)は型式/DD表から自動判定のため保存しない
      batteryless: a.batteryless || undefined,
      label: `軸${i + 1}`,
    }));
    const spec = { axes: cleaned };
    if (String(lead).trim() !== '') spec.leadDays = Math.max(0, Number(lead) || 0);
    saveData('lots', lot.id, { controlSpec: spec });
    onDone && onDone();
  };
  const clearAll = () => { saveData('lots', lot.id, { controlSpec: { axes: [] } }); onDone && onDone(); };

  return (
    <div className="space-y-2">
      {suggestions.length > 0 && (
        <button onClick={applySuggest} className="text-[11px] px-2 py-1 rounded border border-emerald-300 bg-emerald-50 text-emerald-700 font-bold hover:bg-emerald-100 flex items-center gap-1">
          <Wand2 className="w-3.5 h-3.5" /> 型式「{CD.normProductType(lot.model)}」から候補を入れる（{suggestions.map(s => s.label).join('/')}）
        </button>
      )}
      {axes.map((a, i) => {
        const resolved = CD.resolveMotorAxis({ model: a.model, capacity: a.capacity, voltage: a.voltage, batteryless: a.batteryless, dAmp: a.dAmpManual != null ? a.dAmpManual : undefined });
        return (
          <div key={i} className="flex flex-wrap items-center gap-2 bg-white rounded p-2 border border-slate-200">
            <span className="text-[11px] font-bold text-slate-400 w-10">軸{i + 1}</span>
            <input value={a.model} onChange={e => set(i, { model: e.target.value })} placeholder="モーター型式 例 αiS22/4000HV" className="border rounded px-2 py-1 text-sm flex-1 min-w-[180px]" />
            <label className="text-[11px] text-slate-500">容量
              <select value={a.capacity} onChange={e => set(i, { capacity: e.target.value })} className="border rounded px-1 py-1 ml-1 text-sm">
                {CAP_OPTS.map(c => <option key={c} value={c}>{c || '自動'}</option>)}
              </select>
            </label>
            <span className="text-[11px] text-slate-500">→ 判定 {resolved.dAmp
              ? <b className="text-purple-700">(D)ｱﾝﾌﾟ専用(32/35)</b>
              : <b className={resolved.capacity ? 'text-indigo-700' : 'text-red-500'}>{resolved.capacity || '容量?'}</b>}
              <span className="text-slate-400"> {!resolved.dAmp && resolved.source && `(${resolved.source})`} {CD.is400V(resolved.voltage) ? '400V' : '200V'}{resolved.dd ? '・DD' : ''}{resolved.dAmp ? '・D' : ''}</span>
            </span>
            <label className="text-[11px] text-orange-600 flex items-center gap-1" title="型式名にHVが無い400Vモーター用の明示指定"><input type="checkbox" checked={CD.is400V(a.voltage)} onChange={e => set(i, { voltage: e.target.checked ? '400V' : '' })} /> 400V</label>
            <label className="text-[11px] text-cyan-700 flex items-center gap-1"><input type="checkbox" checked={a.batteryless} onChange={e => set(i, { batteryless: e.target.checked })} /> バッテリーレス</label>
            <label className="text-[11px] text-purple-700 flex items-center gap-1" title="D駆動=(D)アンプ専用モーター(号機32/35のみ)。型式の -D 記号から自動判定できないとき手動指定。※直駆動DD(Dis)とは別"><input type="checkbox" checked={a.dAmpManual === true} onChange={e => set(i, { dAmpManual: e.target.checked ? true : null })} /> D駆動</label>
            {axes.length > 1 && <button onClick={() => setAxes(prev => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setAxes(prev => [...prev, { model: '', capacity: '', voltage: '', batteryless: false, dAmpManual: null }])} className="text-indigo-600 text-xs font-bold flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> 軸を追加（2軸テーブル等）</button>
        <label className="text-[11px] text-slate-500 ml-2">この指図のリード日数(空=既定{leadDays})
          <input value={lead} onChange={e => setLead(e.target.value)} placeholder={String(leadDays)} className="w-14 border rounded px-1.5 py-0.5 text-center ml-1" /> 日</label>
        <div className="ml-auto flex gap-2">
          <button onClick={clearAll} className="px-2 py-1 text-xs text-slate-500 hover:text-red-600">クリア</button>
          <button onClick={save} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm font-bold flex items-center gap-1"><Check className="w-4 h-4" /> 保存</button>
        </div>
      </div>
    </div>
  );
}

// ───────── ③ 号機マスタ（追加/編集/削除/Excel・CSV取込） ─────────
// (D)アンプ例外号機エディタ: 型式限定でDモーターを載せられる改造号機(例 31/84×RTT-213/215)を追加・編集。
function DAmpExceptionEditor({ dAmpExceptions = [], saveSettings, isAdmin }) {
  // ⚠編集はローカル下書き(controlled input)で行い、「保存」ボタンで一括反映する。
  //   旧実装(欄を離れるたびに即保存)は、保存→Firestore反映の往復中に次の欄を編集すると
  //   行が再マウントされ入力が消える/巻き戻る競合があり「追加しても反映されない」の根因だった(清水報告)。
  const fromProps = () => (Array.isArray(dAmpExceptions) ? dAmpExceptions : []).map(r => ({
    units: (r.units || []).join(','), productTypes: (r.productTypes || []).join(','), note: r.note || '',
  }));
  const [rows, setRows] = useState(fromProps);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  // 未編集のときだけ外部変更(保存完了/他端末)を取り込む。編集中の下書きは上書きしない。
  const propsJson = JSON.stringify(dAmpExceptions);
  useEffect(() => { if (!dirty) setRows(fromProps()); }, [propsJson]); // eslint-disable-line react-hooks/exhaustive-deps
  const parseList = (s) => String(s || '').split(/[,、\s]+/).map(x => x.trim()).filter(Boolean);
  const upd = (i, patch) => { setDirty(true); setRows(prev => prev.map((r, j) => j === i ? { ...r, ...patch } : r)); };
  const addRow = () => { setDirty(true); setRows(prev => [...prev, { units: '', productTypes: '', note: '' }]); };
  const delRow = (i) => { setDirty(true); setRows(prev => prev.filter((_, j) => j !== i)); };
  const save = async () => {
    if (!saveSettings) return;
    setSaving(true);
    try {
      const cleaned = rows
        .map(r => ({ units: parseList(r.units), productTypes: parseList(r.productTypes), note: (r.note || '').trim() }))
        .filter(r => r.units.length || r.productTypes.length || r.note); // 空行は保存しない
      const bad = cleaned.find(r => !r.units.length || !r.productTypes.length);
      if (bad) { setMsg('⚠号機と対象型式の両方を入れてください（片方だけの行があります）'); setSaving(false); return; }
      await saveSettings({ controlDAmpExceptions: cleaned });
      setDirty(false); setMsg('✅保存しました。取り合いガント（全製品）に即反映されます。');
    } catch (e) { setMsg('保存エラー: ' + (e.message || e)); }
    finally { setSaving(false); }
  };
  const cancel = () => { setRows(fromProps()); setDirty(false); setMsg(''); };
  return (
    <div className="mb-3 rounded-lg border-2 border-violet-200 bg-violet-50/60 p-3">
      <div className="text-[13px] font-black text-violet-800 flex items-center gap-1 mb-1">
        <Wand2 className="w-4 h-4" /> (D)アンプ例外号機（型式限定でDモーター可）
        {dirty && <span className="ml-2 text-[10px] bg-amber-400 text-white rounded px-1.5 py-0.5">未保存の変更あり — 「保存」を押すと反映</span>}
      </div>
      <div className="text-[11px] text-violet-700/80 mb-2">
        通常、-D（(D)アンプ）モーターは200V=号機32・400V=号機35のみ。ここに登録した「号機×対象型式」だけ、その型式のDモーターを追加で載せられます（例：号機31,84 は RTT-213／RTT-215 のみ改造対応）。型式は「,ＡＢ」等のサフィックスなし・大文字小文字/全角半角は不問。
      </div>
      {msg && <div className={`mb-2 text-[11px] rounded px-2 py-1 border ${msg.startsWith('✅') ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-amber-700 bg-amber-50 border-amber-300'}`}>{msg}</div>}
      {rows.length === 0 && <div className="text-[11px] text-slate-400 mb-1">例外なし。</div>}
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 bg-white rounded px-2 py-1.5 border border-violet-200 text-[11px]">
            <label className="flex items-center gap-1">号機
              <input value={r.units} disabled={!isAdmin} onChange={e => upd(i, { units: e.target.value })}
                className="w-24 border rounded px-1.5 py-0.5" placeholder="31,84" />
            </label>
            <label className="flex items-center gap-1">対象型式
              <input value={r.productTypes} disabled={!isAdmin} onChange={e => upd(i, { productTypes: e.target.value })}
                className="w-40 border rounded px-1.5 py-0.5" placeholder="RTT-213,RTT-215" />
            </label>
            <input value={r.note} disabled={!isAdmin} onChange={e => upd(i, { note: e.target.value })}
              className="flex-1 min-w-[120px] border rounded px-1.5 py-0.5 text-slate-500" placeholder="メモ（改造内容など）" />
            {isAdmin && <button onClick={() => delRow(i)} className="text-rose-500 hover:text-rose-700"><Trash2 className="w-3.5 h-3.5" /></button>}
          </div>
        ))}
      </div>
      {isAdmin && (
        <div className="mt-1.5 flex items-center gap-2">
          <button onClick={addRow} className="px-2 py-1 rounded bg-violet-600 hover:bg-violet-700 text-white font-bold text-[11px] flex items-center gap-1"><Plus className="w-3.5 h-3.5" />例外を追加</button>
          <button onClick={save} disabled={saving || !dirty} className={`px-3 py-1 rounded text-white font-bold text-[11px] flex items-center gap-1 disabled:opacity-40 ${dirty ? 'bg-emerald-600 hover:bg-emerald-700 animate-pulse' : 'bg-emerald-600'}`}><Check className="w-3.5 h-3.5" />{saving ? '保存中…' : '保存'}</button>
          {dirty && <button onClick={cancel} className="px-2 py-1 rounded bg-slate-400 hover:bg-slate-500 text-white font-bold text-[11px]">破棄</button>}
        </div>
      )}
      {!isAdmin && <div className="text-[10px] text-violet-500 mt-1">※編集は管理者のみ。</div>}
    </div>
  );
}

function ControllerMaster({ ctls, saveData, deleteData, isAdmin, saveSettings, motorSpecs = [], rawSpecs = [], dAmpExceptions = [] }) {
  const fileRef = useRef(null);
  const [editing, setEditing] = useState(null); // controller draft or null
  const [importMsg, setImportMsg] = useState('');
  const sanId = (u) => String(u).replace(/[\/.#$\[\]]/g, '_');

  const onImport = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const name = (file.name || '').toLowerCase();
    try {
      if (name.endsWith('.xls') || name.endsWith('.xlsx')) {
        // 実Excel（転置レイアウト: 号機を列に並べた表 + D.D.モーター仕様表）
        const XLSX = await loadXLSX();
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const results = wb.SheetNames.map(n => CD.parseControllerMatrix(XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '' })));
        const { controllers, motorSpecs: specs } = CD.mergeControllerParse(results);
        if (!controllers.length) { setImportMsg('号機を読み取れませんでした（「号機」行のある表か確認してください）。'); return; }
        let n = 0;
        for (const c of controllers) { await saveData('controllers', sanId(c.unit), CD.normController(c)); n++; }
        // 特別対応表はマージ: Excel側のunits/容量/電圧を採用しつつ、アプリで編集した備考/フラグ/手動追加行(custom)は温存。
        if (saveSettings && specs.length) await saveSettings({ controlMotorSpecs: CD.mergeMotorSpecs(rawSpecs, specs) });
        setImportMsg(`号機 ${n}台を取り込みました${specs.length ? ` ／ モーター対応表 ${specs.length}件もマージ登録（アプリで編集した備考/フラグ/手動行は温存）` : ''}。`);
      } else {
        // 行=1号機のCSV（従来形式）
        const text = await readCsvSmart(file);
        const parsed = CD.parseControllerCsv(text);
        if (!parsed.length) { setImportMsg('号機を読み取れませんでした（列名を確認）。'); return; }
        let n = 0;
        for (const c of parsed) { await saveData('controllers', sanId(c.unit), { ...c }); n++; }
        setImportMsg(`${n}台を取り込みました。`);
      }
    } catch (err) { setImportMsg('取込エラー: ' + (err.message || err)); }
  };

  const removeCtl = (c) => { if (confirm(`号機${c.unit} を削除しますか？`)) deleteData('controllers', c.id); };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="text-[12px] text-slate-500 flex items-center gap-1"><Info className="w-3.5 h-3.5" />号機×各軸の容量・電圧・D駆動・バッテリーレス対応の一覧。ここに載っている号機だけが割当候補になります。生産課の制御装置Excel(.xls/.xlsx)をそのまま取込めます（号機を列に並べた表＋D.D.モーター仕様表を自動判別）。</div>
        {isAdmin && (
          <div className="ml-auto flex gap-2">
            <input ref={fileRef} type="file" accept=".xls,.xlsx,.csv" className="hidden" onChange={onImport} />
            <button onClick={() => fileRef.current && fileRef.current.click()} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm font-bold flex items-center gap-1.5"><Upload className="w-4 h-4" /> Excel/CSV取込</button>
            <button onClick={() => setEditing({ unit: '', cnc: '', voltage: 'AC200V', caps: {}, dDrive: false, ddCapable: false, bCorr: false, batteryless: false })} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm font-bold flex items-center gap-1.5"><Plus className="w-4 h-4" /> 号機を追加</button>
          </div>
        )}
      </div>
      {importMsg && <div className="mb-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">{importMsg}</div>}
      {!isAdmin && <div className="mb-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">編集・取込は管理者のみ（閲覧中）。</div>}
      {ctls.length > 0 && <div className="mb-2 text-[12px] font-bold text-slate-600">登録号機：{ctls.length}台（容量の「(B)」「(D)」はアンプ種類。運転軸・設備No.・サーボ版数・備考もExcel通り保持）</div>}

      <DAmpExceptionEditor dAmpExceptions={dAmpExceptions} saveSettings={saveSettings} isAdmin={isAdmin} />

      <div className="border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-[12px] whitespace-nowrap">
          <thead className="bg-slate-100 text-slate-500">
            <tr>
              <th className="p-2 text-left sticky left-0 bg-slate-100">号機</th>
              <th className="p-2 text-left">設備No.</th><th className="p-2 text-left">CNC型式</th><th className="p-2 text-left">所有部門</th><th className="p-2 text-left">電圧</th>
              {CD.AXES.map(a => <th key={a} className="p-2 text-center">{a}軸</th>)}
              <th className="p-2 text-left">ｻｰﾎﾞ版数</th><th className="p-2 text-center">D駆動<br/><span className="text-[9px] font-normal">(D)ｱﾝﾌﾟ</span></th><th className="p-2 text-center">DD駆動可<br/><span className="text-[9px] font-normal">18号機〜</span></th><th className="p-2 text-center">なめらか補正<br/><span className="text-[9px] font-normal">DD可なら○(自動)</span></th><th className="p-2 text-center">-B用<br/>なめらか補正</th><th className="p-2 text-center">ﾊﾞｯﾃﾘｰﾚｽ</th><th className="p-2 text-left">備考</th><th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {ctls.map(c => (
              <tr key={c.id} className="border-t border-slate-100 hover:bg-indigo-50/30 align-top">
                <td className="p-2 font-black text-slate-700 sticky left-0 bg-white whitespace-nowrap">
                  {c.unit}
                  {CD.is400V(c.voltage) && <span className="ml-1 text-[8px] px-1 rounded border font-bold bg-orange-100 text-orange-700 border-orange-300">HV</span>}
                  {c.dDrive && <span className="ml-0.5 text-[8px] px-1 rounded border font-bold bg-purple-100 text-purple-700 border-purple-300">D</span>}
                  {c.batteryless && <span className="ml-0.5 text-[8px] px-1 rounded border font-bold bg-cyan-100 text-cyan-700 border-cyan-300">BL</span>}
                </td>
                <td className="p-2 text-slate-400 text-[11px]">{c.equipmentNo || '–'}</td>
                <td className="p-2 text-slate-500">{c.cnc}</td>
                <td className="p-2 text-slate-500 text-[11px]">{c.dept || '–'}</td>
                <td className={`p-2 font-bold ${CD.is400V(c.voltage) ? 'text-orange-600' : 'text-slate-500'}`}>{c.voltage}{CD.is400V(c.voltage) && ' (HV)'}</td>
                {CD.AXES.map(a => <td key={a} className="p-2 text-center text-slate-600">{c.caps[a] ? <span>{c.caps[a]}{c.amps && c.amps[a] ? <span className="text-purple-500 font-bold">({c.amps[a]})</span> : ''}</span> : <span className="text-slate-200">–</span>}</td>)}
                <td className="p-2 text-slate-400 text-[11px]">{c.servo || '–'}</td>
                <td className="p-2 text-center">{c.dDrive ? <span className="text-purple-600 font-black">○</span> : <span className="text-slate-200">×</span>}</td>
                <td className="p-2 text-center">{c.ddCapable ? <span className="text-indigo-500 font-black">○</span> : <span className="text-slate-200">×</span>}</td>
                {/* なめらか補正=DD駆動可の号機なら自動○(導出表示・保存しない) / -B用なめらか補正=Excelの実欄(bCorr)=-B付きDDの可否 */}
                <td className="p-2 text-center" title="DDモーターを回せる号機は(通常の)なめらか補正が可能（自動判定）">{CD.canRunDd(c) ? <span className="text-teal-600 font-black">○</span> : <span className="text-slate-200">×</span>}</td>
                <td className="p-2 text-center" title="-B付きDDモーターを回せるのは、この欄が○の号機のみ（Excelの実欄）">{c.bCorr ? <span className="text-emerald-600 font-black">○</span> : <span className="text-slate-200">×</span>}</td>
                <td className="p-2 text-center">{c.batteryless ? <span className="text-cyan-600 font-black">○</span> : <span className="text-slate-200">×</span>}</td>
                <td className="p-2 text-slate-500 text-[11px] max-w-[180px] whitespace-pre-wrap">{c.note || ''}</td>
                <td className="p-2 text-right whitespace-nowrap">
                  {isAdmin && <>
                    <button onClick={() => setEditing({ ...c })} className="text-indigo-600 hover:text-indigo-800 mr-2"><Pencil className="w-3.5 h-3.5 inline" /></button>
                    <button onClick={() => removeCtl(c)} className="text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5 inline" /></button>
                  </>}
                </td>
              </tr>
            ))}
            {ctls.length === 0 && <tr><td colSpan={19} className="p-6 text-center text-slate-400">号機マスタが空です。生産課の制御装置Excel(.xls/.xlsx)を「Excel/CSV取込」で読み込むか「号機を追加」。</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && <ControllerEditModal draft={editing} onClose={() => setEditing(null)} onSave={(c) => { saveData('controllers', String(c.unit).replace(/[\/.#$\[\]]/g, '_'), { ...c }); setEditing(null); }} />}
    </div>
  );
}

// ───────── モーター一覧（各モーターの自動判定を表で見て・間違いを上書き・FANUC以外も登録） ─────────
const mkey = (m) => CD.toHalfWidth(String(m || '')).replace(/\s+/g, '').toUpperCase();
function MotorMasterView({ orderMotors = [], motorSpecs = [], overrides = [], saveSettings, isAdmin = false }) {
  // 実データ(指図モーター)+特別対応表+登録済みoverride から、全モーター型式を集約(重複除去)
  const models = useMemo(() => {
    const seen = new Map();
    const add = (m) => { const s = String(m || '').trim(); const k = mkey(s); if (s && !seen.has(k)) seen.set(k, s); };
    for (const om of orderMotors) for (const ax of (om.axes || [])) add(ax.model);
    for (const s of motorSpecs) add(s.motorModel);
    for (const o of overrides) add(o.model);
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [orderMotors, motorSpecs, overrides]);
  const ovByKey = useMemo(() => { const m = new Map(); for (const o of overrides) m.set(mkey(o.model), o); return m; }, [overrides]);

  const [draft, setDraft] = useState({}); // key -> {model, capacity, voltage, batteryless, dAmp, dd, note}
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [onlyOverridden, setOnlyOverridden] = useState(false);
  const [newModel, setNewModel] = useState('');
  const propsJson = JSON.stringify(overrides);
  useEffect(() => { if (!dirty) { setDraft({}); } }, [propsJson]); // eslint-disable-line react-hooks/exhaustive-deps

  const cur = (m) => { const k = mkey(m); return (k in draft) ? draft[k] : (ovByKey.get(k) || {}); };
  const setRow = (m, patch) => { const k = mkey(m); setDirty(true); setDraft(d => ({ ...d, [k]: { model: m, ...(k in d ? d[k] : (ovByKey.get(k) || {})), ...patch } })); };
  const clearRow = (m) => { const k = mkey(m); setDirty(true); setDraft(d => ({ ...d, [k]: { model: m, __cleared: true } })); };

  const addMotor = () => {
    const s = newModel.trim(); if (!s) return;
    if (models.some(m => mkey(m) === mkey(s))) { setMsg('その型式は既に一覧にあります。'); return; }
    setRow(s, {}); setNewModel(''); setMsg(''); setDirty(true);
  };
  const save = async () => {
    if (!saveSettings) return; setSaving(true);
    try {
      const next = [...overrides];
      const idxByKey = new Map(next.map((o, i) => [mkey(o.model), i]));
      for (const [k, v] of Object.entries(draft)) {
        const clean = { model: v.model };
        const capN = CD.normCap(v.capacity);
        if (capN) clean.capacity = capN;
        if (v.voltage) clean.voltage = v.voltage;
        if (v.batteryless != null) clean.batteryless = !!v.batteryless;
        if (v.dAmp != null) clean.dAmp = !!v.dAmp;
        if (v.dd != null) clean.dd = !!v.dd;
        if ((v.note || '').trim()) clean.note = v.note.trim();
        const meaningful = !v.__cleared && (clean.capacity || clean.voltage || clean.batteryless != null || clean.dAmp != null || clean.dd != null || clean.note);
        if (idxByKey.has(k)) { if (meaningful) next[idxByKey.get(k)] = clean; else next.splice(idxByKey.get(k), 1); }
        else if (meaningful) next.push(clean);
      }
      // 手動追加(新規モデル)で override は付けないが一覧に残したい行 → 空overrideとして保持
      for (const [k, v] of Object.entries(draft)) if (!idxByKey.has(k) && !next.some(o => mkey(o.model) === k) && !v.__cleared && !models.some(m => mkey(m) === k)) next.push({ model: v.model });
      await saveSettings({ motorOverrides: next });
      setDraft({}); setDirty(false); setMsg('✅保存しました。取り合いガント・ロット登録に即反映されます。');
    } catch (e) { setMsg('保存エラー: ' + (e.message || e)); }
    finally { setSaving(false); }
  };
  const cancel = () => { setDraft({}); setDirty(false); setMsg(''); };

  const ulRef = useRef(null);
  const dlExcel = async () => {
    const XLSX = await loadXLSX();
    const ws = XLSX.utils.aoa_to_sheet(CD.motorOverridesToAoa(models, overrides));
    ws['!cols'] = [30, 8, 9, 16, 9, 9, 7, 7, 11, 24].map(wch => ({ wch }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'モーター一覧');
    XLSX.writeFile(wb, 'モーター一覧_自動判定と上書き.xlsx');
  };
  const ulExcel = async (e) => {
    const file = e.target.files && e.target.files[0]; e.target.value = '';
    if (!file) return;
    try {
      const XLSX = await loadXLSX();
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
      const { overrides: parsed, error } = CD.parseMotorOverridesAoa(aoa);
      if (error) { setMsg(error); return; }
      if (!window.confirm(`現在の上書き${overrides.length}件を、アップロードの${parsed.length}件で全置き換えします。よろしいですか？`)) return;
      await saveSettings({ motorOverrides: parsed });
      setDraft({}); setDirty(false); setMsg(`✅${parsed.length}件の上書きを登録しました。`);
    } catch (err) { setMsg('取込エラー: ' + (err.message || err)); }
  };

  const rows = models.filter(m => !onlyOverridden || (mkey(m) in draft) || ovByKey.has(mkey(m)));
  const capOpts = ['', '10A', '20A', '40A', '80A', '130A', '160A', '180A', '360A'];
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <div className="text-[12px] text-slate-500 flex items-center gap-1"><Info className="w-3.5 h-3.5 shrink-0" />各モーター型式の<b>自動判定</b>（番手→容量・HV=400V・DD・(D)アンプ・-B）を一覧表示。間違っていれば<b>上書き</b>できます。上書きは割当（取り合いガント）とロット登録に即反映。FANUC以外は自動判定できないので容量/電圧/フラグを手入力してください。全{models.length}型式。</div>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-[11px] flex items-center gap-1 text-slate-600"><input type="checkbox" checked={onlyOverridden} onChange={e => setOnlyOverridden(e.target.checked)} />上書きのある型式だけ</label>
          <button onClick={dlExcel} className="px-2.5 py-1 rounded bg-slate-600 hover:bg-slate-700 text-white text-[12px] font-bold flex items-center gap-1"><Download className="w-3.5 h-3.5" />Excelダウンロード</button>
          {isAdmin && saveSettings && <>
            <input ref={ulRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={ulExcel} />
            <button onClick={() => ulRef.current && ulRef.current.click()} className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-bold flex items-center gap-1"><Upload className="w-3.5 h-3.5" />Excelアップロード</button>
          </>}
        </div>
      </div>
      {msg && <div className={`mb-2 text-[11px] rounded px-2 py-1 border ${msg.startsWith('✅') ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-amber-700 bg-amber-50 border-amber-300'}`}>{msg}</div>}
      {!isAdmin && <div className="mb-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">上書き・追加は管理者のみ（閲覧中）。</div>}
      {isAdmin && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <input value={newModel} onChange={e => setNewModel(e.target.value)} placeholder="FANUC以外のモーター型式を追加（例 SGMGV-09ADA6S）" className="border rounded px-2 py-1 text-sm w-72" />
          <button onClick={addMotor} className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-[12px] font-bold flex items-center gap-1"><Plus className="w-3.5 h-3.5" />モーターを追加</button>
          <button onClick={save} disabled={saving || !dirty} className={`px-3 py-1 rounded text-white text-[12px] font-bold flex items-center gap-1 disabled:opacity-40 ${dirty ? 'bg-emerald-600 hover:bg-emerald-700 animate-pulse' : 'bg-emerald-600'}`}><Check className="w-3.5 h-3.5" />{saving ? '保存中…' : '保存'}</button>
          {dirty && <><span className="text-[11px] bg-amber-400 text-white rounded px-1.5 py-0.5">未保存</span><button onClick={cancel} className="px-2 py-1 rounded bg-slate-400 hover:bg-slate-500 text-white text-[11px] font-bold">破棄</button></>}
        </div>
      )}
      <div className="border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-[12px] whitespace-nowrap">
          <thead className="bg-slate-100 text-slate-500">
            <tr>
              <th className="p-2 text-left">モーター型式</th>
              <th className="p-2 text-center bg-slate-50">自動判定<br /><span className="text-[9px] font-normal">容量/電圧/タグ</span></th>
              <th className="p-2 text-center">上書き容量</th><th className="p-2 text-center">上書き電圧</th>
              <th className="p-2 text-center">D駆動<br/><span className="text-[9px] font-normal">(D)ｱﾝﾌﾟ</span></th><th className="p-2 text-center">直駆動<br/>DD</th><th className="p-2 text-center">BL</th>
              <th className="p-2 text-left">備考</th><th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const auto = CD.autoMotorAttrs(m);
              const o = cur(m);
              const overridden = (mkey(m) in draft) || ovByKey.has(mkey(m));
              const effDAmp = o.dAmp != null ? !!o.dAmp : auto.dAmp;
              const effDd = o.dd != null ? !!o.dd : auto.dd;
              const effBl = o.batteryless != null ? !!o.batteryless : auto.batteryless;
              const isFanuc = /[ΑΒAB]I[SF]/.test(mkey(m));
              return (
                <tr key={mkey(m)} className={`border-t border-slate-100 ${overridden ? 'bg-amber-50/40' : 'hover:bg-indigo-50/20'}`}>
                  <td className="p-1.5 font-mono text-slate-700">{m}<MTag model={m} />{overridden && <span className="ml-1 text-[9px] bg-amber-400 text-white font-bold rounded px-1">上書き</span>}</td>
                  <td className="p-1.5 text-center bg-slate-50/60 text-[11px] text-slate-500">
                    <span className="font-bold">{auto.capacity || (isFanuc ? '?' : '—')}</span> / {auto.voltage === '400V' ? '400V(HV)' : (auto.voltage || '—')}
                    <div className="mt-0.5 flex justify-center gap-0.5">
                      {auto.hv && <span className="bg-orange-100 text-orange-600 rounded px-1 text-[8px] font-bold">HV</span>}
                      {auto.dd && <span className="bg-teal-100 text-teal-600 rounded px-1 text-[8px] font-bold">DD</span>}
                      {auto.dAmp && <span className="bg-purple-100 text-purple-600 rounded px-1 text-[8px] font-bold">D</span>}
                      {auto.b && <span className="bg-fuchsia-100 text-fuchsia-700 rounded px-1 text-[8px] font-bold" title="αi-Bシリーズ世代の表記。DDでなければ号機選定に影響しません（割当は電圧＋容量で決まる）">-B(世代)</span>}
                      {auto.batteryless && <span className="bg-cyan-100 text-cyan-600 rounded px-1 text-[8px] font-bold">BL</span>}
                      {!isFanuc && !auto.capacity && <span className="bg-rose-100 text-rose-600 rounded px-1 text-[8px] font-bold">非FANUC:要手入力</span>}
                    </div>
                  </td>
                  <td className="p-1.5 text-center">
                    <select value={CD.normCap(o.capacity) || ''} disabled={!isAdmin} onChange={e => setRow(m, { capacity: e.target.value })} className="border rounded px-1 py-0.5 font-bold text-indigo-700 disabled:border-transparent disabled:bg-transparent disabled:appearance-none">
                      {capOpts.map(c => <option key={c || '_'} value={c}>{c || '（自動）'}</option>)}
                    </select>
                  </td>
                  <td className="p-1.5 text-center">
                    <select value={o.voltage || ''} disabled={!isAdmin} onChange={e => setRow(m, { voltage: e.target.value })} className="border rounded px-1 py-0.5 disabled:border-transparent disabled:bg-transparent disabled:appearance-none">
                      <option value="">（自動）</option><option value="AC200V">200V</option><option value="AC400V">400V(HV)</option>
                    </select>
                  </td>
                  <td className="p-1.5 text-center"><input type="checkbox" checked={effDAmp} disabled={!isAdmin} onChange={e => setRow(m, { dAmp: e.target.checked, ...(e.target.checked ? { dd: false } : {}) })} title="(D)アンプ専用(-D)。自動:{auto.dAmp}" /></td>
                  <td className="p-1.5 text-center"><input type="checkbox" checked={effDd} disabled={!isAdmin} onChange={e => setRow(m, { dd: e.target.checked, ...(e.target.checked ? { dAmp: false } : {}) })} title="直駆動DD(Dis/TSUDA)" /></td>
                  <td className="p-1.5 text-center"><input type="checkbox" checked={effBl} disabled={!isAdmin} onChange={e => setRow(m, { batteryless: e.target.checked })} title="バッテリーレス必須" /></td>
                  <td className="p-1.5"><input key={'n' + (o.note || '')} defaultValue={o.note || ''} disabled={!isAdmin} onBlur={e => { if (e.target.value !== (o.note || '')) setRow(m, { note: e.target.value }); }} className="w-36 border rounded px-1.5 py-0.5 text-slate-500 disabled:border-transparent disabled:bg-transparent" placeholder="備考" /></td>
                  <td className="p-1.5 text-right">{isAdmin && overridden && <button onClick={() => clearRow(m)} title="上書きを消して自動判定に戻す" className="text-slate-400 hover:text-rose-600 text-[10px] underline">自動に戻す</button>}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-slate-400">{onlyOverridden ? '上書きのある型式はありません。' : 'モーターがありません。指図モーター登録で登録するか、上の入力で追加してください。'}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ───────── ④ 型式とモーターの特別対応表（旧D.D.モーター仕様表・編集/Excel往復可） ─────────
// 特別対応表の行キー（型式|軸|モーター|容量）。健全性チェックの照合に使う。
const rowKey = (s) => [s && s.productType, s && s.axisKind, s && s.motorModel, s && s.capacity].join('|');

function MotorSpecTable({ motorSpecs = [], rawSpecs = [], ctls = [], saveSettings, isAdmin = false }) {
  // 型式でグループ化して見やすく（rawSpecs=保存されている生データ・元indexを保持して編集する）
  const rawGroups = useMemo(() => {
    const m = new Map();
    rawSpecs.forEach((s, idx) => { const k = s.productType || '(型式不明)'; if (!m.has(k)) m.set(k, []); m.get(k).push({ s, idx }); });
    return [...m.entries()];
  }, [rawSpecs]);
  // 傾斜軸(units空)が回転軸から継承した号機（表示ヒント用）
  const inhByKey = useMemo(() => { const m = new Map(); for (const s of motorSpecs) if (s.unitsInherited) m.set(rowKey(s), s.units); return m; }, [motorSpecs]);

  // 各行の健全性: units の中に、そのモーターを物理的に回せない号機(電圧/-B用なめらか補正)が含まれていないか。
  const specNeed = (s) => ({ dd: s.dd !== false, isB: CD.isBMotor(s.motorModel), voltage: s.voltage, capacity: s.capacity, model: s.motorModel, units: s.units });
  const health = useMemo(() => {
    const map = new Map(); // key -> {voltageDrop, servoWarn, suggest}
    if (!ctls.length) return map;
    for (const s of motorSpecs) {
      if (!(s.units && s.units.length)) continue;
      const need = specNeed(s);
      const d = CD.unitDiagnostics(need, ctls);
      if (d.voltageDrop.length || d.servoWarn.length) map.set(rowKey(s), { ...d, suggest: CD.suggestDdUnits(need, ctls) });
    }
    return map;
  }, [motorSpecs, ctls]);
  const badRows = [...health.values()];

  const [saving, setSaving] = useState('');
  const applyFix = async (spec, suggest) => {
    if (!saveSettings || !suggest.length) return;
    if (!window.confirm(`${spec.productType} ${spec.axisKind} ${spec.motorModel} の駆動可能号機を [${(spec.units || []).join(',')}] → [${suggest.join(',')}] に修正します。よろしいですか？`)) return;
    setSaving(rowKey(spec));
    // 生データ(継承前)の該当行だけを更新して保存。傾斜軸の継承行(units空)は書き換えず、明示unitsを持つ行のみ対象。
    const next = (rawSpecs || []).map(r =>
      (String(r.productType) === String(spec.productType) && String(r.axisKind) === String(spec.axisKind) && String(r.motorModel) === String(spec.motorModel) && String(r.capacity) === String(spec.capacity))
        ? { ...r, units: [...suggest] } : r);
    try { await saveSettings({ controlMotorSpecs: next }); } finally { setSaving(''); }
  };

  // ── 行編集(管理者): 保存されている生データ(rawSpecs)を直接編集して保存 ──
  const [msg, setMsg] = useState('');
  const ulRef = useRef(null);
  const parseUnits = CD.parseMotorSpecUnitsText;
  const commitRows = async (next) => { if (!saveSettings) return; try { await saveSettings({ controlMotorSpecs: next }); } catch (e) { setMsg('保存エラー: ' + (e.message || e)); } };
  const setRow = (idx, patch) => commitRows(rawSpecs.map((r, j) => j === idx ? { ...r, ...patch } : r));
  const delRow = (idx) => { const r = rawSpecs[idx] || {}; if (window.confirm(`${r.productType || ''} ${r.axisKind || ''} ${r.motorModel || ''} の行を削除しますか？`)) commitRows(rawSpecs.filter((_, j) => j !== idx)); };
  const addRow = () => commitRows([...rawSpecs, { productType: '', axisKind: '回転軸', motorModel: '', capacity: '', voltage: 'AC200V', units: [], dd: false, note: '', custom: true }]);

  // ── Excel往復（ダウンロード→編集→アップロードで全置き換え） ──
  const dlExcel = async () => {
    const XLSX = await loadXLSX();
    const ws = XLSX.utils.aoa_to_sheet(CD.motorSpecsToAoa(rawSpecs));
    ws['!cols'] = [12, 8, 28, 7, 7, 18, 9, 13, 11, 26, 6].map(wch => ({ wch }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '特別対応表');
    XLSX.writeFile(wb, '型式とモーターの特別対応表.xlsx');
  };
  const ulExcel = async (e) => {
    const file = e.target.files && e.target.files[0]; e.target.value = '';
    if (!file) return;
    try {
      const XLSX = await loadXLSX();
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
      const { specs: parsedRaw, error } = CD.parseMotorSpecsAoa(rows);
      if (error) { setMsg(error); return; }
      // 手動列が無い古いファイル: 既存表と突合し、既存の非手動行と同じキーは非手動のまま・新規キーだけ手動扱い
      const known = new Set(rawSpecs.filter(s => s.custom !== true).map(s => rowKey(s)));
      const parsed = parsedRaw.map(r => {
        if (!r.customUnknown) return r;
        const { customUnknown, ...rest } = r;
        return known.has(rowKey(rest)) ? rest : { ...rest, custom: true };
      });
      if (!window.confirm(`現在の${rawSpecs.length}件を、アップロードの${parsed.length}件で全置き換えします。よろしいですか？`)) return;
      await saveSettings({ controlMotorSpecs: parsed });
      setMsg(`${parsed.length}件を登録しました。`);
    } catch (err) { setMsg('取込エラー: ' + (err.message || err)); }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <div className="text-[12px] text-slate-500 flex items-center gap-1"><Info className="w-3.5 h-3.5 shrink-0" />型式ごとの軸モーターと「駆動できる号機」の特別対応。DDモーターも普通のモーターも（FANUC以外も）登録可。ロット登録の「型式から候補を入れる」と割当（取り合い）判定に使われます。全{rawSpecs.length}件。傾斜軸の号機空欄は回転軸から自動継承（直駆動のみ）。</div>
        <div className="ml-auto flex gap-2 shrink-0">
          <button onClick={dlExcel} className="px-3 py-1.5 bg-slate-600 hover:bg-slate-700 text-white rounded text-sm font-bold flex items-center gap-1.5"><Download className="w-4 h-4" /> Excelダウンロード</button>
          {isAdmin && saveSettings && <>
            <input ref={ulRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={ulExcel} />
            <button onClick={() => ulRef.current && ulRef.current.click()} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm font-bold flex items-center gap-1.5"><Upload className="w-4 h-4" /> Excelアップロード登録</button>
            <button onClick={addRow} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm font-bold flex items-center gap-1.5"><Plus className="w-4 h-4" /> 行を追加</button>
          </>}
        </div>
      </div>
      {msg && <div className="mb-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">{msg}</div>}
      {!isAdmin && <div className="mb-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">編集・アップロードは管理者のみ（閲覧中）。</div>}

      {/* 健全性チェック: units に「電圧/サーボで物理的に回せない号機」が混ざっている行を検出 */}
      {badRows.length > 0 && (
        <div className="mb-3 rounded-lg border-2 border-amber-300 bg-amber-50 p-3">
          <div className="text-[13px] font-black text-amber-800 flex items-center gap-1 mb-1.5"><AlertTriangle className="w-4 h-4" /> DD表 健全性チェック：{badRows.length}件の行で「駆動できる号機」に物理的に回せない号機が含まれています</div>
          <div className="space-y-1.5">
            {[...health.entries()].map(([k, d]) => {
              const s = motorSpecs.find(x => rowKey(x) === k); if (!s) return null;
              return (
                <div key={k} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] bg-white/70 rounded px-2 py-1.5 border border-amber-200">
                  <span className="font-black text-slate-700">{s.productType}</span>
                  <span className="text-slate-500">{s.axisKind}</span>
                  <span className="font-mono text-slate-600">{s.motorModel}<MTag model={s.motorModel} /></span>
                  <span className="text-slate-400">現在:[{(s.units || []).join(',')}]</span>
                  {d.voltageDrop.length > 0 && <span className="text-orange-700">⚡電圧不一致:{d.voltageDrop.join(',')}</span>}
                  {d.servoWarn.length > 0 && <span className="text-fuchsia-700">⚙回せない:{d.servoWarn.join(',')}（{CD.isBMotor(s.motorModel) ? '-B=「-B用なめらか補正」○のみ' : 'DD対応機のみ'}）</span>}
                  {d.suggest.length > 0
                    ? <span className="font-bold text-emerald-700">→ 推奨:[{d.suggest.join(',')}]</span>
                    : <span className="text-slate-400">→ 該当号機なし</span>}
                  {isAdmin && d.suggest.length > 0 && saveSettings && (
                    <button onClick={() => applyFix(s, d.suggest)} disabled={saving === k}
                      className="ml-auto px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] disabled:opacity-50">
                      {saving === k ? '保存中…' : `[${d.suggest.join(',')}]に修正`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {!isAdmin && <div className="text-[10px] text-amber-600 mt-1">※修正は管理者でログインすると行えます。</div>}
        </div>
      )}

      <div className="border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-[12px] whitespace-nowrap">
          <thead className="bg-slate-100 text-slate-500">
            <tr>
              <th className="p-2 text-left">型式</th><th className="p-2 text-left">軸</th><th className="p-2 text-left">モーター型式<span className="text-[9px] font-normal ml-1">タグ=型式から自動判定</span></th>
              <th className="p-2 text-center">自動容量</th><th className="p-2 text-center">容量</th><th className="p-2 text-center">電圧</th><th className="p-2 text-left">駆動できる号機</th>
              <th className="p-2 text-center">直駆動<br/>DD</th><th className="p-2 text-center">D駆動<br/><span className="text-[9px] font-normal">(D)ｱﾝﾌﾟ</span></th><th className="p-2 text-center">BL</th><th className="p-2 text-left">備考</th><th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {rawGroups.map(([type, list]) => list.map(({ s, idx }, i) => {
              const bad = health.get(rowKey(s));
              const inh = inhByKey.get(rowKey(s));
              const autoCap = CD.standardCapacity(s.motorModel);
              const capOpts = CAP_OPTS.includes(s.capacity || '') ? CAP_OPTS : [...CAP_OPTS, s.capacity];
              return (
                <tr key={idx + '_' + rowKey(s)} className={`border-t ${i === 0 ? 'border-slate-300' : 'border-slate-100'} ${bad ? 'bg-amber-50/60' : 'hover:bg-indigo-50/30'}`}>
                  <td className="p-1.5 font-black text-slate-700">
                    <input defaultValue={s.productType || ''} disabled={!isAdmin} onBlur={e => { const v = e.target.value.trim(); if (v !== (s.productType || '')) setRow(idx, { productType: CD.normProductType(v) }); }}
                      className="w-24 border rounded px-1.5 py-0.5 font-black disabled:border-transparent disabled:bg-transparent" placeholder="RTT-112" />
                  </td>
                  <td className="p-1.5">
                    <select value={s.axisKind || ''} disabled={!isAdmin} onChange={e => setRow(idx, { axisKind: e.target.value })} className="border rounded px-1 py-0.5 disabled:border-transparent disabled:bg-transparent disabled:appearance-none">
                      {[...new Set(['回転軸', '傾斜軸', s.axisKind || ''])].map(k => <option key={k} value={k}>{k || '–'}</option>)}
                    </select>
                  </td>
                  <td className="p-1.5 font-mono">
                    <input defaultValue={s.motorModel || ''} disabled={!isAdmin} onBlur={e => { const v = e.target.value.trim(); if (v !== (s.motorModel || '')) setRow(idx, { motorModel: v }); }}
                      className="w-52 border rounded px-1.5 py-0.5 font-mono disabled:border-transparent disabled:bg-transparent" placeholder="Dis 60/400" />
                    <MTag model={s.motorModel} />
                    {s.custom && <span className="ml-1 text-[9px] bg-indigo-100 text-indigo-600 rounded px-1" title="アプリで手動追加/アップロードした行（生産課Excel再取込でも消えません）">手動</span>}
                  </td>
                  <td className="p-1.5 text-center text-slate-400" title="モーター型式の番手からの自動判定（表の容量が優先されます）">{autoCap || '–'}</td>
                  <td className="p-1.5 text-center">
                    <select value={s.capacity || ''} disabled={!isAdmin} onChange={e => setRow(idx, { capacity: e.target.value })} className={`border rounded px-1 py-0.5 font-bold text-indigo-700 disabled:border-transparent disabled:bg-transparent disabled:appearance-none ${autoCap && s.capacity && autoCap !== s.capacity ? 'bg-amber-50' : ''}`}>
                      {capOpts.map(c => <option key={c || '_'} value={c || ''}>{c || '–'}</option>)}
                    </select>
                  </td>
                  <td className="p-1.5 text-center">
                    <select value={CD.is400V(s.voltage) ? '400V' : '200V'} disabled={!isAdmin} onChange={e => setRow(idx, { voltage: e.target.value === '400V' ? 'AC400V' : 'AC200V' })}
                      className={`border rounded px-1 py-0.5 font-bold disabled:border-transparent disabled:bg-transparent disabled:appearance-none ${CD.is400V(s.voltage) ? 'text-orange-600' : 'text-slate-500'}`}>
                      <option value="200V">200V</option><option value="400V">400V(HV)</option>
                    </select>
                  </td>
                  <td className="p-1.5">
                    {/* key=値: 外部からの変更([修正]ボタン/他端末)で必ず再マウントし、古い表示値のblurで巻き戻さない */}
                    <input key={'u' + (s.units || []).join(',')} defaultValue={(s.units || []).join(',')} disabled={!isAdmin} onBlur={e => { const v = parseUnits(e.target.value); if (v.join(',') !== (s.units || []).join(',')) setRow(idx, { units: v }); }}
                      className="w-28 border rounded px-1.5 py-0.5 disabled:border-transparent disabled:bg-transparent" placeholder={inh ? '空=継承' : '例 18,22,23'} />
                    {(!s.units || !s.units.length) && inh && <span className="ml-1 text-[9px] bg-slate-200 text-slate-500 rounded px-1" title="空欄=回転軸と同一制御装置(自動継承)">継承:[{inh.join(',')}]</span>}
                    {bad && <span className="ml-1 text-[9px] bg-amber-400 text-white font-bold rounded px-1">要確認</span>}
                  </td>
                  {/* 直駆動DDと D駆動((D)ｱﾝﾌﾟ)は別概念で排他: 片方を○にするともう片方は自動で外れる */}
                  <td className="p-1.5 text-center"><input type="checkbox" checked={s.dd !== false} disabled={!isAdmin} onChange={e => setRow(idx, e.target.checked ? { dd: true, dAmp: false } : { dd: false })} title="直駆動(Dis/TSUDA等)。○=駆動できる号機の表が必須。D駆動とは排他" /></td>
                  <td className="p-1.5 text-center"><input type="checkbox" checked={s.dAmp === true} disabled={!isAdmin} onChange={e => setRow(idx, e.target.checked ? { dAmp: true, dd: false } : { dAmp: false })} title="(D)アンプ専用モーター(-D)。○=D駆動号機のみ。直駆動とは排他" /></td>
                  <td className="p-1.5 text-center"><input type="checkbox" checked={!!s.batteryless} disabled={!isAdmin} onChange={e => setRow(idx, { batteryless: e.target.checked })} title="バッテリーレス必須" /></td>
                  <td className="p-1.5">
                    <input key={'n' + (s.note || '')} defaultValue={s.note || ''} disabled={!isAdmin} onBlur={e => { const v = e.target.value; if (v !== (s.note || '')) setRow(idx, { note: v }); }}
                      className="w-40 border rounded px-1.5 py-0.5 text-slate-500 disabled:border-transparent disabled:bg-transparent" placeholder="備考" />
                  </td>
                  <td className="p-1.5 text-right">
                    {isAdmin && <button onClick={() => delRow(idx)} className="text-rose-400 hover:text-rose-600"><Trash2 className="w-3.5 h-3.5 inline" /></button>}
                  </td>
                </tr>
              );
            }))}
            {rawSpecs.length === 0 && <tr><td colSpan={12} className="p-6 text-center text-slate-400">まだ登録がありません。「号機マスタ」タブで生産課の制御装置Excelを取り込むか、「行を追加」「Excelアップロード登録」で登録してください。</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ControllerEditModal({ draft, onClose, onSave }) {
  const [d, setD] = useState({ ...draft, caps: { ...(draft.caps || {}) } });
  const set = (patch) => setD(prev => ({ ...prev, ...patch }));
  const setCap = (a, v) => setD(prev => ({ ...prev, caps: { ...prev.caps, [a]: v } }));
  return (
    <div className="fixed inset-0 z-[300] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="bg-slate-800 text-white p-3 font-bold flex justify-between items-center rounded-t-xl"><span>号機 {d.unit || '（新規）'}</span><button onClick={onClose}><X className="w-5 h-5" /></button></div>
        <div className="p-4 space-y-3">
          <div className="flex gap-2">
            <label className="text-xs text-slate-500 flex-1">号機番号<input value={d.unit} onChange={e => set({ unit: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></label>
            <label className="text-xs text-slate-500 flex-1">CNCユニット<input value={d.cnc} onChange={e => set({ cnc: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" placeholder="例 31i-MA" /></label>
          </div>
          <label className="text-xs text-slate-500 block">制御電圧
            <select value={CD.is400V(d.voltage) ? '400V' : '200V'} onChange={e => set({ voltage: e.target.value === '400V' ? 'AC400V' : 'AC200V' })} className="border rounded px-2 py-1 text-sm ml-2">
              <option value="200V">AC200V</option><option value="400V">AC400V (HV)</option>
            </select>
          </label>
          <div className="grid grid-cols-3 gap-2">
            {CD.AXES.map(a => (
              <label key={a} className="text-xs text-slate-500">{a}軸 容量
                <select value={d.caps[a] || ''} onChange={e => setCap(a, e.target.value)} className="w-full border rounded px-1 py-1 text-sm">
                  {CAP_OPTS.map(c => <option key={c} value={c}>{c || '（無）'}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="text-sm flex items-center gap-1.5" title="運転軸に(D)アンプを積んでいる号機"><input type="checkbox" checked={!!d.dDrive} onChange={e => set({ dDrive: e.target.checked })} /> D駆動（(D)アンプ）</label>
            <label className="text-sm flex items-center gap-1.5" title="D.D.モーター（テーブル）を駆動できる能力・18号機以上。○の号機は(通常の)なめらか補正も可"><input type="checkbox" checked={!!d.ddCapable} onChange={e => set({ ddCapable: e.target.checked })} /> DDモーター駆動可</label>
            <label className="text-sm flex items-center gap-1.5" title="-B付きDDモーター(DIS80/400HV-B等)を回せる号機のみ○"><input type="checkbox" checked={!!d.bCorr} onChange={e => set({ bCorr: e.target.checked })} /> -B用なめらか補正</label>
            <label className="text-sm flex items-center gap-1.5"><input type="checkbox" checked={!!d.batteryless} onChange={e => set({ batteryless: e.target.checked })} /> バッテリーレス 対応</label>
          </div>
        </div>
        <div className="p-3 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-slate-500 text-sm">キャンセル</button>
          <button onClick={() => { if (!String(d.unit).trim()) { alert('号機番号を入れてください'); return; } onSave(CD.normController(d)); }} className="px-4 py-1.5 bg-indigo-600 text-white rounded text-sm font-bold">保存</button>
        </div>
      </div>
    </div>
  );
}

// ───────── A3 PDF・印刷（画面で見ているビュー＝号機別 or 指図別 のガントをそのまま印刷） ─────────
function printAllocation(alloc, ctls, leadDays, view = 'unit') {
  const today = CD.ymdToMs(todayYmd());
  const { assignments = [], conflicts = [], contentions = [], scarceNeeds = [], ampleNeeds = [] } = alloc;

  // タグHTML（画面の UTag / MTag と同じ意味）
  const unitTagHtml = (c) => { const f = unitFlags(c || {}); return `${f.hv ? '<span class="tag hv">HV</span>' : ''}${f.d ? '<span class="tag d">D</span>' : ''}${f.bl ? '<span class="tag bl">BL</span>' : ''}`; };
  const motorTagHtml = (m) => `${CD.isHV(m) ? '<span class="tag hv">HV</span>' : ''}${CD.isDD(m) ? '<span class="tag dd">DD</span>' : ''}${CD.isDAmp(m) ? '<span class="tag d">D</span>' : ''}`;
  const axShort = (label) => label === '回転軸' ? '回' : label === '傾斜軸' ? '傾' : (label || '');

  // インデックス（画面と同じ）
  const ctlByUnit = {}; for (const c of ctls) ctlByUnit[String(c.unit)] = c;
  const asgByUnit = {}; for (const a of assignments) (asgByUnit[String(a.unit)] = asgByUnit[String(a.unit)] || []).push(a);
  const blkByUnit = {}; for (const c of contentions) (blkByUnit[String(c.unit)] = blkByUnit[String(c.unit)] || []).push(c);

  const contMap = new Map();
  for (const c of contentions) { const k = c.unit + '|' + c.blocked.orderNo + '|' + c.blocker.orderNo; if (!contMap.has(k)) contMap.set(k, c); }
  const contList = [...contMap.values()].sort((a, b) => a.overlapStart - b.overlapStart);
  const noResMap = new Map();
  for (const cf of conflicts) for (const u of cf.unmet) if (!(u.rivals && u.rivals.length)) {
    const k = cf.orderNo + '|' + CD.needTypeLabel(u.need) + '|' + (u.need?.model || ''); // 同一指図内の別モーター(-D2軸等)が1行に潰れないようmodelもキーへ
    if (!noResMap.has(k)) noResMap.set(k, { orderNo: cf.orderNo, model: cf.model, due: cf.due, label: CD.needTypeLabel(u.need), motor: u.need.model || '' });
  }
  const noResource = [...noResMap.values()];
  const contOrderCount = new Set(contList.map(c => c.blocked.orderNo)).size;
  const noResOrderCount = new Set(noResource.map(n => n.orderNo)).size;

  // タイムライン範囲
  const wins = [];
  for (const a of assignments) { wins.push(a.start, a.end); }
  for (const c of contentions) { wins.push(c.blocked.start, c.blocked.end); }
  let hStart = today, hEnd = today + 7 * DAY_MS;
  if (wins.length) { hStart = Math.min(today, ...wins); hEnd = Math.max(today, ...wins); }
  hStart -= DAY_MS; hEnd += DAY_MS;
  const span = Math.max(DAY_MS, hEnd - hStart);
  const xPct = (ms) => ((ms - hStart) / span) * 100;
  const dayCount = Math.round(span / DAY_MS);
  const step = dayCount > 60 ? 7 : (dayCount > 20 ? 2 : 1);
  let ticks = '';
  for (let t = hStart; t <= hEnd; t += DAY_MS * step) ticks += `<span class="tick" style="left:${xPct(t).toFixed(2)}%">${fmtMD(t)}</span>`;
  const ROW = 15;

  const laneUnits = [...new Set([...Object.keys(asgByUnit), ...Object.keys(blkByUnit)])].sort((x, y) => (Number(x) - Number(y)) || x.localeCompare(y));
  const rows = laneUnits.map(uk => {
    const c = ctlByUnit[uk] || { unit: uk };
    const asgs = (asgByUnit[uk] || []).map(a => ({ ...a, motor: (a.need && a.need.model) || '' }));
    const packed = packRows(asgs);
    const blocked = blkByUnit[uk] || [];
    const asgH = packed.rowCount * ROW;
    const laneH = asgH + (blocked.length ? ROW + 3 : 0) + 4;
    const bars = packed.bars.map(a => {
      const left = xPct(a.start), width = Math.max(1.2, xPct(a.end) - xPct(a.start));
      const urgent = a.due <= today + 2 * DAY_MS;
      return `<div class="bar ${urgent ? 'u' : ''}" style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%;top:${2 + a.row * ROW}px" title="指図${esc(a.orderNo)} ${esc(a.motor)}">${esc(a.orderNo)} ${esc(a.motor)}${motorTagHtml(a.motor)}</div>`;
    }).join('');
    const blks = blocked.map(b => {
      const bl = xPct(b.blocked.start), bw = Math.max(1.2, xPct(b.blocked.end) - xPct(b.blocked.start));
      const ol = xPct(b.overlapStart), ow = Math.max(1.2, xPct(b.overlapEnd) - xPct(b.overlapStart));
      return `<div class="bar cf" style="left:${bl.toFixed(2)}%;width:${bw.toFixed(2)}%;top:${asgH + 2}px">⚠${esc(b.blocked.orderNo)} 取り合い</div><div class="olap" style="left:${ol.toFixed(2)}%;width:${ow.toFixed(2)}%;top:${asgH + 2}px"></div>`;
    }).join('');
    return `<div class="row" style="height:${laneH}px"><div class="lbl">号機${esc(c.unit)}${unitTagHtml(c)}<div class="cnc">${esc(c.cnc || '')}</div></div><div class="lane"><div class="todayline" style="left:${xPct(today).toFixed(2)}%"></div>${bars}${blks}</div></div>`;
  }).join('');

  const contRows = contList.map(c => {
    const cf = ctlByUnit[String(c.unit)] || {};
    return `<tr><td>号機${esc(c.unit)}${unitTagHtml(cf)}</td><td>${esc(c.blocker.orderNo)} (${esc(CD.msToYmd(c.blocker.due).slice(5))}納期)</td><td class="hot">${esc(c.blocked.orderNo)} (${esc(CD.msToYmd(c.blocked.due).slice(5))}納期)</td><td>${esc(CD.msToYmd(c.overlapStart).slice(5))}〜${esc(CD.msToYmd(c.overlapEnd).slice(5))}</td><td>${esc(axShort(c.need && c.need.label))} ${esc((c.need && c.need.model) || '')}${motorTagHtml(c.need && c.need.model)}</td></tr>`;
  }).join('');
  const noResRows = noResource.map(n => `<tr><td>${esc(n.orderNo)}</td><td>${esc(n.model)}</td><td>${esc(CD.msToYmd(n.due).slice(5))}</td><td class="hot">${esc(n.label)}</td><td>${esc(n.motor)}${motorTagHtml(n.motor)}</td></tr>`).join('');

  // 指図別（軸→号機・両軸集約が分かる）
  const asgByOrderP = {}; for (const a of assignments) (asgByOrderP[a.orderNo] = asgByOrderP[a.orderNo] || []).push(a);
  const confByOrder = {}; for (const cf of conflicts) confByOrder[cf.orderNo] = cf;
  const orderList = [...new Set([...Object.keys(asgByOrderP), ...Object.keys(confByOrder)])];
  const orderMeta = {}; for (const a of assignments) orderMeta[a.orderNo] = { model: a.model, due: a.due };
  for (const cf of conflicts) orderMeta[cf.orderNo] = orderMeta[cf.orderNo] || { model: cf.model, due: cf.due };
  orderList.sort((x, y) => (orderMeta[x].due || 0) - (orderMeta[y].due || 0) || String(x).localeCompare(String(y)));
  const orderRows = orderList.map(o => {
    const as = asgByOrderP[o] || []; const units = [...new Set(as.map(a => String(a.unit)))];
    const cf = confByOrder[o]; const noRes = cf && cf.unmet.some(u => !(u.rivals && u.rivals.length));
    const state = cf ? (noRes ? '<span class="hot">使える号機なし</span>' : (as.length ? '一部取り合い' : '<span class="hot">取り合い</span>')) : '割当';
    const axMap = units.length === 1 && !cf ? `号機${units[0]}(両軸)` : (as.length ? as.map(a => `${esc(axShort(a.need && a.need.label))}:${esc(a.unit)}`).join(' ') : (cf ? '—' : ''));
    const tagStr = units.map(u => unitTagHtml(ctlByUnit[u] || {})).join('');
    return `<tr><td>${esc(o)}</td><td>${esc(orderMeta[o].model || '')}</td><td>${esc(CD.msToYmd(orderMeta[o].due).slice(5))}</td><td>${state}</td><td>${axMap} ${tagStr}</td></tr>`;
  }).join('');

  // 指図別ガント（バー）：画面の「指図別」ビューと同じ。各指図が占有期間(納期-リード〜納期)にどの号機で回るか。
  const orderWin = {};
  for (const a of assignments) orderWin[a.orderNo] = orderWin[a.orderNo] || { start: a.start, end: a.end, due: a.due, model: a.model };
  for (const cf of conflicts) orderWin[cf.orderNo] = orderWin[cf.orderNo] || { start: cf.start, end: cf.end, due: cf.due, model: cf.model };
  const orderGanttRows = orderList.map(o => {
    const w = orderWin[o] || { start: today, end: today, due: today, model: orderMeta[o].model };
    const as = asgByOrderP[o] || []; const units = [...new Set(as.map(a => String(a.unit)))];
    const cf = confByOrder[o]; const noRes = cf && cf.unmet.some(u => !(u.rivals && u.rivals.length));
    const urgent = w.due <= today + 2 * DAY_MS;
    const cls = cf ? (noRes ? 'rose' : 'cf') : (urgent ? 'u' : '');
    const txt = cf ? (noRes ? '使える号機なし' : '取り合い') : (units.length === 1 ? `号機${units[0]}(両軸)` : (as.length ? as.map(a => `${axShort(a.need && a.need.label)}:${a.unit}`).join(' ') : ''));
    const left = xPct(w.start), width = Math.max(1.2, xPct(w.end) - xPct(w.start));
    const tagStr = units.map(u => unitTagHtml(ctlByUnit[u] || {})).join('');
    return `<div class="row" style="height:${ROW + 4}px"><div class="lbl">${esc(o)} ${esc(w.model || '')}${tagStr}</div><div class="lane"><div class="todayline" style="left:${xPct(today).toFixed(2)}%"></div><div class="bar ${cls}" style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%;top:2px" title="${esc(o)} ${esc(txt)}">${esc(txt)}</div></div></div>`;
  }).join('');

  const summary = [...scarceNeeds.map(t => `<span class="chip ${t.qualifyingCount === 0 ? 'rose' : t.qualifyingCount < t.demandCount ? 'red' : 'amber'}">${esc(t.label)}: 号機${t.qualifyingCount}台/要求${t.demandCount}件${t.qualifyingCount === 0 ? '(使える号機なし)' : ''}</span>`),
  ...ampleNeeds.map(t => `<span class="chip green">${esc(t.label)}: ${t.qualifyingCount}台(余裕)</span>`)].join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>制御装置 割当・取り合い</title><style>
    @page{size:A3 landscape;margin:10mm}
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{font-family:'Yu Gothic','Meiryo',sans-serif;color:#1e293b;font-size:11px}
    h1{font-size:16px;margin:0 0 2px}.sub{color:#64748b;font-size:10px;margin-bottom:6px}
    .banner{display:inline-block;border:2px solid;border-radius:6px;padding:3px 8px;margin:0 6px 6px 0;font-weight:bold;font-size:11px}
    .banner.red{border-color:#fca5a5;background:#fef2f2;color:#b91c1c}.banner.ok{border-color:#a7f3d0;background:#ecfdf5;color:#047857}
    .chip{display:inline-block;border-radius:4px;padding:2px 6px;margin:2px;font-weight:bold;font-size:10px;border:1px solid}
    .chip.red{background:#fee2e2;border-color:#fca5a5;color:#b91c1c}.chip.amber{background:#fffbeb;border-color:#fcd34d;color:#b45309}.chip.green{background:#ecfdf5;border-color:#a7f3d0;color:#047857}.chip.rose{background:#ffe4e6;border-color:#fda4af;color:#be123c}
    h2{font-size:12px;margin:10px 0 4px;border-bottom:1px solid #cbd5e1;padding-bottom:2px}
    .tag{display:inline-block;color:#fff;font-size:8px;font-weight:bold;border-radius:3px;padding:0 3px;margin-left:2px;vertical-align:middle}
    .tag.hv{background:#f97316}.tag.d{background:#a855f7}.tag.bl{background:#06b6d4}.tag.dd{background:#14b8a6}
    .axis{position:relative;height:16px;margin-left:150px;border-bottom:1px solid #e2e8f0}
    .tick{position:absolute;top:0;font-size:8px;color:#94a3b8;border-left:1px solid #e2e8f0;padding-left:1px}
    .row{display:flex;align-items:stretch;border-bottom:1px solid #f1f5f9}
    .lbl{width:150px;flex:none;font-size:9px;font-weight:bold;padding:2px 4px}.lbl .cnc{color:#94a3b8;font-weight:normal}
    .lane{position:relative;flex:1}
    .bar{position:absolute;height:${ROW - 2}px;background:#6366f1;color:#fff;font-size:8px;font-weight:bold;border-radius:2px;padding:0 2px;overflow:hidden;white-space:nowrap;line-height:${ROW - 2}px}
    .bar.u{background:#f97316}.bar.cf{background:#ef4444;border:1px solid #b91c1c}.bar.rose{background:#e11d48;border:1px solid #9f1239}
    .olap{position:absolute;height:${ROW - 2}px;background:rgba(220,38,38,.55)}
    .todayline{position:absolute;top:0;bottom:0;border-left:1px solid #93c5fd}
    table{border-collapse:collapse;width:100%;font-size:10px;margin-bottom:4px}td,th{border:1px solid #cbd5e1;padding:3px 5px;text-align:left;white-space:nowrap}th{background:#f1f5f9}
    td.hot{color:#b91c1c;font-weight:bold}
  </style></head><body>
    <h1>制御装置（号機）割当・取り合い表</h1>
    <div class="sub">作成 ${esc(todayYmd())} ／ 占有期間＝納期の ${leadDays} 日前〜納期 ／ 橙＝納期2日以内</div>
    <div>
      <span class="banner ${contOrderCount ? 'red' : 'ok'}">① 号機の取り合い ${contOrderCount}件の指図（同じ号機を奪い合い）</span>
      <span class="banner ${noResOrderCount ? 'red' : 'ok'}">② 使える号機が無い ${noResOrderCount}件の指図（動かせる号機ゼロ）</span>
    </div>
    <div>${summary || '<span class="sub">モーター登録された指図がありません</span>'}</div>
    ${view === 'order'
      ? `<h2>■ 指図別ガント（各指図がどの号機で回るか／(両軸)＝同じ号機・赤＝取り合い）</h2><div class="axis">${ticks}</div>${orderGanttRows || '<div class="sub">指図なし</div>'}`
      : `<h2>■ 号機別ガント（各号機がどの指図を動かすか／赤＝取り合い）</h2><div class="axis">${ticks}</div>${rows || '<div class="sub">割当なし</div>'}`}
    ${orderRows ? `<h2>■ 指図別 割当先 一覧（軸→号機。「(両軸)」＝同じ号機で両軸）</h2><table><thead><tr><th>指図</th><th>型式</th><th>納期</th><th>状態</th><th>軸→号機 / タグ</th></tr></thead><tbody>${orderRows}</tbody></table>` : ''}
    ${contList.length ? `<h2>■ ① 号機の取り合い ${contList.length}件</h2><table><thead><tr><th>号機</th><th>先に押さえた指図</th><th>置けなかった指図</th><th>重複期間</th><th>軸/モーター</th></tr></thead><tbody>${contRows}</tbody></table>` : ''}
    ${noResource.length ? `<h2>■ ② 使える号機が無い ${noResource.length}件</h2><table><thead><tr><th>指図</th><th>型式</th><th>納期</th><th>必要スペック</th><th>モーター</th></tr></thead><tbody>${noResRows}</tbody></table>` : ''}
  </body></html>`;

  const pw = window.open('', '_blank');
  if (!pw) { alert('ポップアップがブロックされました。許可してください。'); return; }
  pw.document.write(html);
  pw.document.close();
  setTimeout(() => { try { pw.print(); } catch (e) {} }, 500);
}

export default ControlDeviceView;
