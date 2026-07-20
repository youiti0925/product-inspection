// 🧪 エミュレータのテストロットを覗く (B.1 #7 の検証用)。本番には絶対に繋がらない。
//   FIRESTORE_EMULATOR_HOST 必須。読み取り専用。
//
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/inspect-emulator.mjs [lotId]

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, signInAnonymously, connectAuthEmulator } from 'firebase/auth';

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!HOST) { console.error('❌ FIRESTORE_EMULATOR_HOST が未設定です。中止します。'); process.exit(1); }
const [h, p] = HOST.split(':');

const app = initializeApp({ projectId: 'inspection-time-c4fd3', apiKey: 'emulator-fake-key' });
const db = getFirestore(app);
connectFirestoreEmulator(db, h, Number(p));
const auth = getAuth(app);
connectAuthEmulator(auth, `http://${h}:9099`, { disableWarnings: true });
await signInAnonymously(auth);

const lotId = process.argv[2] || 'lot-emu-1';
const snap = await getDoc(doc(db, 'artifacts', 'product-inspection-v1', 'public', 'data', 'lots', lotId));
if (!snap.exists()) { console.log(`(ロット ${lotId} は存在しません)`); process.exit(0); }
const lot = snap.data();

const hhmm = (ms) => ms ? new Date(ms).toISOString().slice(11, 19) : '—';
const mins = (ms) => (ms / 60000).toFixed(2);

console.log(`\n=== ${lotId} : ${lot.orderNo} / ${lot.model} / status=${lot.status} / 担当=${lot.workerId} ===`);

const tasks = lot.tasks || {};
const keys = Object.keys(tasks).sort();
if (!keys.length) console.log('タスクなし');
keys.forEach(k => {
  const t = tasks[k];
  const ss = Array.isArray(t.sessions) ? t.sessions : [];
  const total = ss.reduce((s, x) => s + Math.max(0, (x.endTime || 0) - (x.startTime || 0)), 0);
  console.log(`\n[${k}] status=${t.status} duration=${t.duration ?? '—'}s sessions=${ss.length} 実作業=${mins(total)}分`);
  console.log(`      firstStartTime=${hhmm(t.firstStartTime)} endTime=${hhmm(t.endTime)} (単純差=${t.firstStartTime && t.endTime ? mins(t.endTime - t.firstStartTime) : '—'}分)`);
  ss.forEach((s, i) => console.log(
    `      #${i + 1} ${hhmm(s.startTime)}〜${hhmm(s.endTime)} (${mins((s.endTime || 0) - s.startTime)}分) 担当=${s.workerName || s.workerId || '—'} 品質=${s.quality} 由来=${s.source}`
  ));
});

const runs = Array.isArray(lot.machineRuns) ? lot.machineRuns : [];
console.log(`\n--- machineRuns: ${runs.length}件 ---`);
runs.forEach(r => {
  const wall = (r.segments || []).reduce((s, sg) => s + Math.max(0, (sg.endTime || 0) - sg.startTime), 0);
  console.log(`  ${r.stepTitle} 台=[${(r.unitIndices || []).join(',')}] segments=${(r.segments || []).length} 壁時計=${mins(wall)}分 監視=${r.monitoringRequirement} closeReason=${r.closeReason}`);
  (r.segments || []).forEach((sg, i) => console.log(`      seg${i + 1} ${hhmm(sg.startTime)}〜${hhmm(sg.endTime)}`));
});
process.exit(0);
