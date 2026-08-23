# YouTube Live Timestamp

YouTube のライブ配信を視聴中に、ショートカット一発で「配信開始からの経過時間」を記録する Chrome 拡張（Manifest V3 / TypeScript / WXT）。

## 使い方

1. `npm install && npm run build`
2. `chrome://extensions` → 「デベロッパーモード」→「パッケージ化されていない拡張機能を読み込む」→ `dist/chrome-mv3/` を選択
3. YouTube のライブ配信ページで **Alt+Shift+T** を押すと記録。拡張アイコンのバッジに件数が出る
4. 拡張アイコンをクリックすると記録一覧。各行のリンクは `watch?v=...&t=...s` で VOD 位置を開く。「テキストをコピー」で動画ごとの `h:mm:ss` 一覧（コメント・概要欄用）、「JSON」で全件バックアップ

- 同じ配信で 1.5 秒以内の連打は重複として無視（バッジ `=`）。記録は最大 5000 件で古い順に消える

ショートカットが他と衝突する場合は `chrome://extensions/shortcuts` で変更できる。

## 開発

```
npm run dev        # WXT 開発モード（HMR）
npm test           # vitest
npm run typecheck  # tsc --noEmit
```

設計判断は `notes/91_gdr/INDEX.md`（GDR）を参照。
