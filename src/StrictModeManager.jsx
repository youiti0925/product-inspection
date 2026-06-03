// =============================================================================
//  StrictModeManager.jsx — 厳密モードの一元管理（型式 × テンプレ）
// -----------------------------------------------------------------------------
//  ・単位は「型式(model) × テンプレ(templateId)」の組み合わせ。これで「どの順番を
//    強制するか」が一意に決まる。
//  ・「件数が貯まった」では推奨しない。エビデンス＝実時刻のある完了ロットで、実際の
//    作業順がテンプレ定義順と一致した割合(順番の一貫性)を見て、管理者が判断する。
//  ・どの組み合わせが 厳密/ガイド/未設定 か、エビデンス、最終変更(誰・いつ)を表で一覧。
//  ・変更は strict_mode_history に追記(いつ・誰・何を・どのエビデンスで)。
// =============================================================================
import React, { useState, useMemo } from 'react';
import { ShieldCheck, X, Search, History, Lock, Unlock, Minus, Info, AlertTriangle, CheckCircle2 } from 'lucide-react';

export const STRICT_COMBO_SEP = '␟'; // 区切り(通常文字と衝突しない記号)
export const strictComboKey = (model, templateId) => `${model || ''}${STRICT_COMBO_SEP}${templateId || ''}`;
export const parseStrictCombo = (key) => { const i = (key || '').indexOf(STRICT_COMBO_SEP); return i < 0 ? [key, ''] : [key.slice(0, i), key.slice(i + 1)]; };

// 1ロットの「時刻のある工程」を返す [{i, start}]
function lotTimedSteps(lot) {
  const steps = lot.steps || [], tasks = lot.tasks || {}, q = lot.quantity || 1;
  const out = [];
  steps.forEach((s, i) => {
    let min = Infinity;
    for (let u = 0; u < q; u++) {
      const t = tasks[`${s.id}-${u}`] || tasks[`${i}-${u}`];
      const ts = t && (t.firstStartTime || t.startTime);
      if (ts && ts < min) min = ts;
    }
    if (min !== Infinity) out.push({ i, start: min });
  });
  return out;
}

// === エビデンス算出(純粋関数)。完了ロットを 型式×テンプレ ごとに集計 ===
export function computeStrictEvidence(lots, templates) {
  const tName = (id) => (templates || []).find(t => t.id === id)?.name || '(テンプレ不明)';
  const completed = (lots || []).filter(l => l.status === 'completed');
  const groups = {};
  completed.forEach(l => {
    const key = strictComboKey(l.model || '(型式空)', l.templateId || '');
    (groups[key] = groups[key] || []).push(l);
  });
  const rows = Object.entries(groups).map(([key, g]) => {
    const [model, tid] = parseStrictCombo(key);
    let timedCount = 0, consistentCount = 0;
    g.forEach(lot => {
      const arr = lotTimedSteps(lot);
      if (arr.length < 2) return;            // 順番を語るには2工程以上の実時刻が要る
      timedCount++;
      const actual = [...arr].sort((a, b) => a.start - b.start).map(x => x.i);
      const tmpl = [...arr].sort((a, b) => a.i - b.i).map(x => x.i);
      if (JSON.stringify(actual) === JSON.stringify(tmpl)) consistentCount++;
    });
    const consistencyPct = timedCount > 0 ? Math.round(consistentCount / timedCount * 100) : null;
    // 判定: 十分なデータ(実時刻3件以上)かつ一貫性80%以上 → 推奨検討可。それ未満は保留/根拠なし。
    let quality = 'none';                    // none(根拠なし) / thin(データ薄) / unstable(ばらつき) / good(安定)
    if (timedCount === 0) quality = 'none';
    else if (timedCount < 3) quality = 'thin';
    else if (consistencyPct >= 80) quality = 'good';
    else quality = 'unstable';
    return { key, model, templateId: tid, templateName: tName(tid), completedCount: g.length, timedCount, consistentCount, consistencyPct, quality };
  });
  rows.sort((a, b) => (b.timedCount - a.timedCount) || (b.completedCount - a.completedCount) || a.model.localeCompare(b.model));
  return rows;
}

const QUALITY = {
  good:     { cls: 'bg-emerald-100 text-emerald-800 border-emerald-300', Icon: CheckCircle2,  label: '十分・安定' },
  unstable: { cls: 'bg-rose-100 text-rose-800 border-rose-300',          Icon: AlertTriangle, label: 'ばらつき大' },
  thin:     { cls: 'bg-amber-100 text-amber-800 border-amber-300',       Icon: Info,          label: 'データ薄' },
  none:     { cls: 'bg-slate-100 text-slate-500 border-slate-300',       Icon: Minus,         label: '根拠なし' },
};

const fmtWhen = (ts) => { if (!ts) return '-'; const d = new Date(ts); return isNaN(d) ? '-' : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

function StateBadge({ enabled }) {
  if (enabled === true) return <span className="inline-flex items-center gap-1 text-xs font-black px-2 py-0.5 rounded bg-rose-600 text-white"><Lock className="w-3 h-3" />厳密</span>;
  if (enabled === false) return <span className="inline-flex items-center gap-1 text-xs font-black px-2 py-0.5 rounded bg-slate-200 text-slate-600"><Unlock className="w-3 h-3" />ガイド</span>;
  return <span className="text-xs font-bold text-slate-400">未設定</span>;
}

export function StrictModeManagerModal({ lots, templates, rules = {}, history = [], currentUserName = '', onDecide, onClose }) {
  const [view, setView] = useState('table');          // 'table' | 'history'
  const [q, setQ] = useState('');
  const [onlyUndecided, setOnlyUndecided] = useState(false);

  const rows = useMemo(() => computeStrictEvidence(lots, templates), [lots, templates]);
  const filtered = useMemo(() => {
    const kw = q.trim();
    return rows.filter(r => {
      if (kw && !(`${r.model} ${r.templateName}`.includes(kw))) return false;
      if (onlyUndecided && rules[r.key]?.enabled != null) return false;
      return true;
    });
  }, [rows, q, onlyUndecided, rules]);

  const decided = rows.filter(r => rules[r.key]?.enabled != null).length;
  const strictOn = rows.filter(r => rules[r.key]?.enabled === true).length;

  return (
    <div className="fixed inset-0 z-[120] bg-slate-900/60 flex items-stretch justify-center md:p-4" onClick={onClose}>
      <div className="bg-white w-full md:max-w-6xl md:rounded-2xl shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* ヘッダー */}
        <div className="shrink-0 bg-gradient-to-r from-rose-700 to-rose-600 text-white px-5 py-3 flex items-center gap-3">
          <ShieldCheck className="w-6 h-6" />
          <div className="flex-1 min-w-0">
            <div className="font-black text-lg leading-tight">厳密モード 一元管理（型式 × テンプレ）</div>
            <div className="text-[11px] text-rose-100">組み合わせ {rows.length} 件 ／ 決定済み {decided} 件（厳密 {strictOn}）。件数ではなく「順番の一貫性」で判断してください。</div>
          </div>
          <div className="flex bg-white/15 rounded-lg p-0.5">
            <button onClick={() => setView('table')} className={`px-3 py-1.5 rounded text-xs font-bold ${view === 'table' ? 'bg-white text-rose-700' : 'text-white'}`}>管理表</button>
            <button onClick={() => setView('history')} className={`px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1 ${view === 'history' ? 'bg-white text-rose-700' : 'text-white'}`}><History className="w-3.5 h-3.5" />変更履歴</button>
          </div>
          <button onClick={onClose} className="bg-white/15 hover:bg-white/30 rounded-full p-2"><X className="w-5 h-5" /></button>
        </div>

        {view === 'table' ? (
          <>
            {/* ツール */}
            <div className="shrink-0 px-4 py-2 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="型式・テンプレで絞り込み" className="pl-8 pr-2 py-1.5 text-sm rounded-lg border border-slate-300 outline-none focus:border-rose-500 w-64" />
              </div>
              <label className="flex items-center gap-1.5 text-sm font-bold text-slate-600 cursor-pointer">
                <input type="checkbox" checked={onlyUndecided} onChange={e => setOnlyUndecided(e.target.checked)} /> 未設定のみ
              </label>
              <div className="ml-auto text-[11px] text-slate-500 flex items-center gap-1"><Info className="w-3.5 h-3.5" />エビデンス＝実時刻のある完了ロットで作業順がテンプレ順と一致した割合</div>
            </div>

            {/* 表 */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 bg-slate-100 z-10">
                  <tr className="text-left text-slate-700">
                    <th className="px-3 py-2 font-black border-b border-slate-300">型式</th>
                    <th className="px-3 py-2 font-black border-b border-slate-300">テンプレ（工程の並び）</th>
                    <th className="px-3 py-2 font-black border-b border-slate-300 text-center">完了</th>
                    <th className="px-3 py-2 font-black border-b border-slate-300">エビデンス（順番の一貫性）</th>
                    <th className="px-3 py-2 font-black border-b border-slate-300 text-center">状態</th>
                    <th className="px-3 py-2 font-black border-b border-slate-300">最終変更</th>
                    <th className="px-3 py-2 font-black border-b border-slate-300 text-center">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => {
                    const rule = rules[r.key];
                    const Q = QUALITY[r.quality];
                    return (
                      <tr key={r.key} className="border-b border-slate-100 hover:bg-rose-50/40 align-top">
                        <td className="px-3 py-2 font-bold text-slate-800 whitespace-nowrap">{r.model}</td>
                        <td className="px-3 py-2 text-slate-600">{r.templateName}</td>
                        <td className="px-3 py-2 text-center font-mono text-slate-700">{r.completedCount}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center gap-1 text-[11px] font-black px-1.5 py-0.5 rounded border ${Q.cls}`}><Q.Icon className="w-3 h-3" />{Q.label}</span>
                            <span className="text-xs text-slate-600">
                              {r.timedCount > 0 ? `実時刻 ${r.timedCount} 件中 ${r.consistentCount} 件が順番どおり（${r.consistencyPct}%）` : '実時刻データなし'}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center"><StateBadge enabled={rule?.enabled} /></td>
                        <td className="px-3 py-2 text-[11px] text-slate-500 whitespace-nowrap">
                          {rule?.decidedAt ? <>{rule.decidedBy || '?'}<br />{fmtWhen(rule.decidedAt)}</> : '-'}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1 justify-center">
                            <button title="この組み合わせを厳密(順番強制)に" onClick={() => onDecide(r, true)} className={`px-2 py-1 rounded text-[11px] font-bold border ${rule?.enabled === true ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-rose-700 border-rose-300 hover:bg-rose-50'}`}>厳密</button>
                            <button title="ガイド(警告のみ・飛ばし可)に" onClick={() => onDecide(r, false)} className={`px-2 py-1 rounded text-[11px] font-bold border ${rule?.enabled === false ? 'bg-slate-600 text-white border-slate-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>ガイド</button>
                            {rule?.enabled != null && <button title="未設定に戻す" onClick={() => onDecide(r, null)} className="px-2 py-1 rounded text-[11px] font-bold border bg-white text-slate-400 border-slate-200 hover:bg-slate-50">解除</button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && <tr><td colSpan={7} className="text-center py-10 text-slate-400">該当する組み合わせがありません</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="shrink-0 px-4 py-2 border-t border-slate-200 bg-slate-50 text-[11px] text-slate-500">
              💡 「厳密」＝この型式×テンプレは既定で「1台目から順番」を強制（作業者は現場で切替も可）。「ガイド」＝警告のみで飛ばし可。判断は<b>エビデンス</b>を見て。データが薄い／根拠なしのまま厳密にするのは非推奨です。
            </div>
          </>
        ) : (
          /* 変更履歴 */
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-slate-100 z-10">
                <tr className="text-left text-slate-700">
                  <th className="px-3 py-2 font-black border-b border-slate-300">日時</th>
                  <th className="px-3 py-2 font-black border-b border-slate-300">担当</th>
                  <th className="px-3 py-2 font-black border-b border-slate-300">型式 × テンプレ</th>
                  <th className="px-3 py-2 font-black border-b border-slate-300">変更</th>
                  <th className="px-3 py-2 font-black border-b border-slate-300">その時のエビデンス</th>
                </tr>
              </thead>
              <tbody>
                {[...history].sort((a, b) => (b.at || 0) - (a.at || 0)).map(h => {
                  const lbl = (v) => v === true ? '厳密' : v === false ? 'ガイド' : '未設定';
                  const ev = h.evidence;
                  return (
                    <tr key={h.id} className="border-b border-slate-100 align-top">
                      <td className="px-3 py-2 text-[11px] text-slate-600 whitespace-nowrap">{fmtWhen(h.at)}</td>
                      <td className="px-3 py-2 font-bold text-slate-700 whitespace-nowrap">{h.by || '?'}</td>
                      <td className="px-3 py-2 text-slate-700">{h.model} <span className="text-slate-400">×</span> {h.templateName || h.templateId}</td>
                      <td className="px-3 py-2 whitespace-nowrap"><span className="text-slate-400">{lbl(h.old)}</span> <span className="text-slate-400">→</span> <b className={h.new === true ? 'text-rose-700' : 'text-slate-700'}>{lbl(h.new)}</b></td>
                      <td className="px-3 py-2 text-[11px] text-slate-600">{ev ? `完了${ev.completedCount}・実時刻${ev.timedCount}件中${ev.consistentCount}件一致${ev.consistencyPct != null ? `(${ev.consistencyPct}%)` : ''}` : '-'}</td>
                    </tr>
                  );
                })}
                {history.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-slate-400">まだ変更履歴はありません</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
