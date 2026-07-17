// 完了連絡(kind='complete')の実データ監査 — 読み取りのみ。
// sendComplete は contact_requests と lots.completeNotified を必ず対で書く。
// 片方だけ = 「送ったつもりのない送信」or「印だけ残る」の動かぬ証拠になる。
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
const app = initializeApp({ apiKey:'AIzaSyDiIS-TDH6MgXaLvG9T2VRioFDomQ_zQ9E', authDomain:'inspection-time-c4fd3.firebaseapp.com', projectId:'inspection-time-c4fd3' });
await signInAnonymously(getAuth(app));
const db = getFirestore(app);
const NS = 'product-inspection-v1';
const reqs = await getDocs(collection(db,'artifacts',NS,'public','data','contact_requests'));
const lots = await getDocs(collection(db,'artifacts',NS,'public','data','lots'));
const byId = {}; lots.forEach(s => byId[s.id] = s.data());
const comp = [];
reqs.forEach(s => { const d = s.data(); if (d.kind === 'complete') comp.push({ id:s.id, ...d }); });
comp.sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
const J = t => t ? new Date(t).toLocaleString('ja-JP') : '-';
console.log('=== kind=complete の連絡:', comp.length, '件 ===');
for (const c of comp) {
  const lot = Object.values(byId).find(l => l.completeNotified?.reqId === c.id);
  console.log([
    J(c.createdAt), c.orderNo||'(指図なし)', c.model||'', `→${c.to}`,
    `status=${c.status}`, `needAck=${c.needAck}`,
    c.answer ? `返信:${c.answer.choice}/${c.answer.by}/${J(c.answer.at)}` : '返信なし',
    lot ? 'lot印:あり' : '⚠lot印:なし(対の書き込みが無い)',
  ].join(' | '));
}
// 逆向き: lot に印があるのに連絡が無い
const ids = new Set(comp.map(c=>c.id));
let orphan = 0;
Object.entries(byId).forEach(([id,l]) => { if (l.completeNotified?.reqId && !ids.has(l.completeNotified.reqId)) { orphan++; console.log('⚠ lot印あり/連絡なし:', l.orderNo, l.model, J(l.completeNotified.at)); } });
console.log('--- lot印あり/連絡なし:', orphan, '件');
console.log('--- 完了ロット総数:', Object.values(byId).filter(l=>l.status==='completed'||l.location==='completed').length);
console.log('--- うち completeNotified 印あり:', Object.values(byId).filter(l=>l.completeNotified).length);
