# YouTube Live Timestamp

YouTube のライブ配信を視聴中に、ショートカット一発で「配信開始からの経過時間」を記録する Chrome 拡張（Manifest V3 / TypeScript / WXT）。

## 使い方

1. `npm install && npm run build`
2. `chrome://extensions` → 「デベロッパーモード」→「パッケージ化されていない拡張機能を読み込む」→ `dist/chrome-mv3/` を選択
3. YouTube のライブ配信ページで **Alt+Shift+T** を押すか、拡張アイコン → **「● 記録」** で記録。バッジに件数が出る
4. 拡張アイコンをクリックすると**配信ごと**の記録一覧（配信タイトルが親、記録が子。今開いている配信は先頭で展開）。配信ごとに「コピー」「削除」、各記録のメモ欄をクリックすると一言メモを付けられる。「補正」で視聴遅延分の秒数を調整（例: 配信が 10 秒遅れて見えているなら `-10`）。各行のリンクは `watch?v=...&t=...s` で VOD 位置を開く。「テキストをコピー」で配信ごとに `# タイトル` + URL + `h:mm:ss メモ` の一覧（コメント・概要欄用）、「JSON」で全件バックアップ

- 同じ配信で 1.5 秒以内の連打は重複として無視（バッジ `=`）。記録は最大 5000 件で古い順に消える

ショートカットが他と衝突する場合は `chrome://extensions/shortcuts` で変更できる。

## 開発

```
npm run dev        # WXT 開発モード（HMR）
npm test           # vitest
npm run typecheck  # tsc --noEmit
```

設計判断は `notes/91_gdr/INDEX.md`（GDR）を参照。
