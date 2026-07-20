# Phase B / B.1 — 実績を「区間」で記録する機能の制約と検証手順

## ⚠ 運用上の制約（対応するまで守ってください）

### 同じロットを、同時に複数の端末で操作しないでください

作業セッション（`task.sessions`）と機械運転（`lot.machineRuns`）は、
Firestore の `setDoc(merge: true)` で保存しています。**トランザクションではありません。**

そのため、2台の端末が同じロットをほぼ同時に保存すると、
**後から保存した側の配列で丸ごと上書きされ、もう一方が記録した区間は失われます。**

開閉処理は冪等（同じ操作が二度届いても二重に増えない）にしてありますが、
これは「二重適用で壊れない」だけで、**競合を解決するものではありません**。
以前「多端末でも安全」と説明しましたが、**その表現は誤りだったので撤回します。**

- 影響範囲: 同じロットを同時操作した場合の `sessions` / `machineRuns` のみ。
  従来からある `duration` / `firstStartTime` / `endTime` は変わりません（合計時間は失われません）。
- 恒久対策（**未実施**）: `runTransaction` 化、またはセッションを別コレクションへ追記型で持つ。

## 対象範囲

**製品検査アプリのみ**です。最終検査（golden）には入れていません。

実測（2026-07-20 のバックアップ）:

| | 最大ロット | 平均 | 最大tasks数 |
|---|---|---|---|
| 製品検査 | 143 KB | 10.6 KB | 71 |
| 最終検査 | **1,056 KB** | 127 KB | 550 |

最終検査のロットは既に Firestore の1ドキュメント上限（約1MB）ぎりぎりで、
`sessions` を足すと保存が壊れます。横展開する場合は `lot_images` と同じ別コレクション方式が必要です。

## まだやっていないこと

- 休憩区間（`interruptions` の `type: 'break'`）の区間化 → Phase C
- 計画手待ち（`autoOpportunityWindows`）と活用可能時間 → Phase C
- 並列作業率の計算式そのもの → **未変更**。画面は「暫定・評価に使えません」のままです

---

## エミュレータでの検証手順（本番データを使わない）

### 前提

- JDK（Firestore エミュレータに必須）。未導入なら `winget install Microsoft.OpenJDK.21`
- `firebase-tools`

### 手順

```bash
# 1) エミュレータ起動
cd product-inspection-app
firebase emulators:start --only firestore,auth --project inspection-time-c4fd3

# 2) 別ターミナルでテスト用データを投入
#    ⚠FIRESTORE_EMULATOR_HOST が無いとスクリプトが自分で止まります（本番書き込み事故の防止）
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seed-emulator.mjs

# 3) アプリをエミュレータへ向けて起動
echo "VITE_USE_EMULATOR=1" >> .env.local
npm run dev
```

`.env.local` の `VITE_USE_EMULATOR=1` があるときだけエミュレータへ繋ぎます。
`import.meta.env.DEV` でも守っているので、**本番ビルドでは絶対に通りません。**

投入されるもの: 作業者2名（尾田/片山・テスト）、自動＋手動工程を持つテンプレ1件、
ロット `EMU-0001 / 🧪テスト型式 / 2台`。

### 確認する操作

1. 「準備」を開始 → 数秒待って一時停止 → 再開 → 完了
2. 「回転自動測定開始」を開始 → 一時停止 → 再開 → 完了
3. 自動が動いている間に「外観検査」を開始（自動＋手動は許可されること）
4. 手動が動いている間にもう1つ手動を開始しようとする（**ブロックされること**）
5. 「準備」を開始したまま、左上の担当セレクタで 尾田 → 片山 へ変更 → 完了

### 期待する結果

| 操作 | 期待 |
|---|---|
| 1 の完了後 | `task.sessions` が 2本。合計は停止時間を含まない |
| 2 の完了後 | `lot.machineRuns` が **1件**、`segments` が **2件** |
| 3 | 開始できる |
| 4 | 「手動作業を同時に2件は開始できません」で止まる |
| 5 の完了後 | `sessions` が 2本。1本目が尾田、2本目が片山（`source: 'handoff'`） |

エミュレータUI（http://127.0.0.1:4000/firestore ）で
`artifacts/product-inspection-v1/public/data/lots/lot-emu-1` を開くと中身を直接確認できます。
