// 🧪 エミュレータ専用のシードデータ (B.1 #7)。本番には絶対に繋がらない。
//   FIRESTORE_EMULATOR_HOST を必須にしており、未設定なら起動時に落とす。
//
// 使い方:
//   1) firebase emulators:start --only firestore,auth --project inspection-time-c4fd3
//   2) PowerShell:  $env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"; node scripts/seed-emulator.mjs
//      bash:        FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seed-emulator.mjs
//   3) PowerShell:  $env:VITE_USE_EMULATOR = "1"; npm run dev   (.env.local へは書かない=消し忘れ防止)
//
// 入れるもの: 作業者2名(尾田/片山)・自動工程と手動工程を持つテンプレ1件・テスト用ロット1件。

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, signInAnonymously, connectAuthEmulator } from 'firebase/auth';

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!HOST) {
  console.error('❌ FIRESTORE_EMULATOR_HOST が未設定です。本番へ書き込む事故を防ぐため中止します。');
  console.error('   PowerShell: $env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"; node scripts/seed-emulator.mjs');
  console.error('   bash      : FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seed-emulator.mjs');
  process.exit(1);
}
const [h, p] = HOST.split(':');

const app = initializeApp({ projectId: 'inspection-time-c4fd3', apiKey: 'emulator-fake-key' });
const db = getFirestore(app);
connectFirestoreEmulator(db, h, Number(p));
// 本番と同じ firestore.rules がエミュレータにも適用される (allow ... if request.auth != null)。
// アプリと同じく匿名認証を通す。
const auth = getAuth(app);
connectAuthEmulator(auth, `http://${h}:9099`, { disableWarnings: true });
await signInAnonymously(auth);

const NS = 'product-inspection-v1';
const base = (col, id) => doc(db, 'artifacts', NS, 'public', 'data', col, id);

const STEPS = [
  { id: 'st-prep',  title: '準備',            type: 'normal', targetTime: 120, executionMode: 'manual' },
  { id: 'st-auto',  title: '回転自動測定開始', type: 'normal', targetTime: 600, executionMode: 'batch',
    workResource: 'measurement-machine' },
  { id: 'st-visual', title: '外観検査',        type: 'normal', targetTime: 180, executionMode: 'manual' },
];

await setDoc(base('workers', 'wA'), { id: 'wA', name: '尾田(テスト)', active: true });
await setDoc(base('workers', 'wB'), { id: 'wB', name: '片山(テスト)', active: true });

await setDoc(base('templates', 'tpl-emu'), {
  id: 'tpl-emu', name: '🧪エミュレータ検証用テンプレ', steps: STEPS, updatedAt: Date.now(),
});

await setDoc(base('lots', 'lot-emu-1'), {
  id: 'lot-emu-1',
  orderNo: 'EMU-0001',
  model: '🧪テスト型式',
  quantity: 2,
  templateId: 'tpl-emu',
  steps: STEPS,
  tasks: {},
  status: 'processing',
  location: 'inspection',
  executionType: 'custom',
  workerId: 'wA',
  entryAt: Date.now(),
  createdAt: Date.now(),
});

await setDoc(base('settings', 'config'), {
  workers: [], customTargetTimes: {}, modelGroups: [],
});

console.log('✅ エミュレータへ投入しました (workers 2 / templates 1 / lots 1)');
console.log('   ロット: EMU-0001 / 🧪テスト型式 / 2台 / 担当=尾田(テスト)');
process.exit(0);
