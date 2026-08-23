# GDR-EXT

> 拡張構成・manifest・権限に関する決定。

## GDR-EXT-001: WXT 3 エントリ構成・最小権限

- **status:** Implemented
- **scope:** arch, pol
- **決定:**
  - フレームワークは **WXT**（0.21 系）、Manifest V3、ターゲットは Chrome のみ
  - エントリポイントは 3 つ
    - `entrypoints/youtube.content.ts` — `*://www.youtube.com/*` にマッチ、ISOLATED world。タイムスタンプ取得（GDR-DOM-001 のロジック）と保存を担う
    - `entrypoints/background.ts` — service worker。`chrome.commands.onCommand` を受けてアクティブタブの content script に「記録せよ」メッセージを送るだけ
    - `entrypoints/popup/` — 現在タブの記録一覧と補正値の表示。フレームワークなし（素の TS + HTML）
  - 権限は **`storage` のみ**。`host_permissions` / `tabs` / `activeTab` / `scripting` は宣言しない
  - 記録トリガーは `commands`（既定 `Alt+Shift+T`）。manifest の `commands` は権限不要
  - 拡張内メッセージは `{ type: "capture" }` / `{ type: "capture:result", ok, record | error }` の discriminated union を `src/lib/messages.ts` に型定義し、`chrome.runtime.sendMessage` / `chrome.tabs.sendMessage` で送る
  - ストレージは WXT の `wxt/utils/storage` 経由で `local:` 領域を使う（`local:records` = `TimestampRecord[]`、`local:settings` = `{ offsetSec }`）。スキーマの詳細設計は GDR-STORE-001 で扱う
  - `src/lib/` は WXT / `browser` API に依存させない（純 TS のまま vitest で検証）。拡張 API に触るのは `entrypoints/` と `src/ext/` だけ
- **理由:**
  - WXT は manifest 自動生成・HMR・`@types/chrome` 同梱・vitest 連携があり、単独開発者の立ち上げコストが最小（GDR-DOM-001 フェーズ 1 でも vitest を前提にしている）
  - GDR-DOM-001 で MAIN world 注入を不採用にしたため、content script は ISOLATED world だけで完結し `scripting` 権限が不要
  - `tabs` 権限は URL 読み取りに必要だが、videoId は content script 側が `location.href` から取るので不要。`onCommand` のコールバックに `tab` が渡るため `tabs.query` も不要
  - **代替案 A: Vite + CRXJS** → 実績はあるが manifest を手書きする必要があり、WXT と比べて利点がない。却下
  - **代替案 B: background を持たず、content script が `keydown` を直接拾う** → 権限も最小だが、YouTube のキーボードショートカットと競合し、入力欄フォーカス時の扱いも自前になる。却下
  - **代替案 C: popup に React / Svelte を導入** → 一覧表示程度では過剰。UI が複雑化したら GDR-UI で再検討。却下
  - **代替案 D: `chrome.storage.sync`** → 容量上限（100KB）が記録用途に厳しい。却下
- **影響:**
  - ディレクトリは WXT 標準（`entrypoints/` / `src/lib/` / `public/`）。`src/lib/timestamp/` は既存のまま
  - `npm run dev`（`wxt`）/ `npm run build`（`wxt build`）/ `npm test`（vitest）/ `npm run typecheck`
  - content script は記録アクション時のみ動作し、常駐監視はしない（GDR-DOM-001 perf 方針を踏襲）
  - `offsetSec` は当面 `local:settings.offsetSec` から読む（既定 0）。設定 UI は GDR-UI 候補
  - 記録成功時は `browser.action.setBadgeText` で当該タブに件数を表示する（`action` は権限不要）。ページ内トーストは GDR-UI 候補
- **再検討条件:**
  - Firefox 対応を行う → WXT の `browser` 抽象は対応済みだが、`commands` / MV3 background の差異を確認し GDR-EXT を分割
  - SPA 遷移後の再取得で `webNavigation` 等の権限が必要になった → 権限追加の GDR
  - popup の状態管理が肥大化した → UI フレームワーク導入を GDR-UI で検討
  - Chrome Web Store 公開を行う → `prod` scope / `PUB` PREFIX の追加（GDR-META-001 再検討条件）
- **日時:** 2026-08-24T00:00:00+09:00
- **関連:** depends-on GDR-DOM-001; relates-to GDR-META-001
- **出典:** [notes/20_kaizen/2026-08-24_wxt_structure.md](../../20_kaizen/2026-08-24_wxt_structure.md)
