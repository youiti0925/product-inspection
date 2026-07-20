// 【読み取り専用】ロットに焼き付いたstepのexecutionMode実態(過去ロットと現行マスタの食い違い検証)
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
const app = initializeApp({ apiKey: "AIzaSyDiIS-TDH6MgXaLvG9T2VRioFDomQ_zQ9E", authDomain: "inspection-time-c4fd3.firebaseapp.com", projectId: "inspection-time-c4fd3" });
await signInAnonymously(getAuth(app));
const db = getFirestore(app);
const snap = await getDocs(collection(db, 'artifacts', 'product-inspection-v1', 'public', 'data', 'lots'));
const target = ['三次元測定開始', '回転分割測定開始', '三次元測定機キャリブレーション', '分割測定開始_手動'];
const acc = {};
snap.docs.forEach(d => {
  const l = d.data();
  if (l.status !== 'completed' && l.location !== 'completed') return;
  (l.steps || []).forEach(s => {
    if (!target.includes(s.title)) return;
    const k = `${s.title} / em=${s.executionMode || '(未設定)'}`;
    acc[k] = (acc[k] || 0) + 1;
  });
});
console.log('完了ロットに焼き付いた step の executionMode 実態:');
Object.entries(acc).sort().forEach(([k, v]) => console.log(`  ${k}: ${v}工程インスタンス`));
process.exit(0);
