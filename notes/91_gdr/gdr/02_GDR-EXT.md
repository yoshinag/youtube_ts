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
- **関連:** depends-on GDR-DOM-001; relates-to GDR-META-001; refined-by GDR-EXT-002（`downloads` 権限）
- **出典:** [notes/20_kaizen/2026-08-24_wxt_structure.md](../../20_kaizen/2026-08-24_wxt_structure.md)

## GDR-EXT-002: スクリーンショットは `downloads` 権限で `Downloads/ss/` に保存する


- **status:** Accepted
- **scope:** arch, pol
- **決定:**
  - `permissions` に **`downloads` を追加**する（GDR-EXT-001「`storage` のみ」の例外）。`tabs` / `activeTab` / `scripting` / `host_permissions` は引き続き追加しない
  - 保存は background の `browser.downloads.download({ url: dataUrl, filename: "ss/{name}.png", conflictAction: "uniquify", saveAs: false })`。Chrome の仕様上、拡張から書けるのは**ダウンロードフォルダ配下のみ**で、絶対パスは指定できない
  - 保存先は `~/Downloads/ss/` 固定とし、拡張はサブフォルダ名 `ss` だけを知っている。別の場所（例 `/Users/yn_mini_0/_works/ss`）に置きたい場合は利用者側で `ln -s <実体> ~/Downloads/ss` を張れば済む（任意・README に注記のみ。合意 2026-09-08: 当面はリンクを張らず `~/Downloads/ss/` で運用）
  - 「フォルダを開く」は popup から `browser.downloads.show(downloadId)`（Finder で最新のスクショを選択状態で表示）。`downloadId` はセッション中の最新値、なければ `downloads.search({ filenameRegex: "/ss/[^/]+\\.png$", orderBy: ["-startTime"], limit: 1 })` で探し、それも無ければ `downloads.showDefaultFolder()` にフォールバック
  - トリガーは popup の「📷」ボタンと `commands` の `capture-screenshot`（既定 `Alt+Shift+S`）。両方とも background の `screenshot(tabId)` に集約する（popup → background へ `{ type: "screenshot" }`）
- **理由:**
  - `downloads` は「保存先のサブフォルダ指定」「保存後にフォルダを開く」の両方を満たす唯一の標準 API で、ユーザーの操作なしに保存できる
  - **代替案 A: File System Access API（`showDirectoryPicker`）** → 任意のフォルダに書けるが、ハンドルの許可はブラウザ再起動のたびに再要求が必要で、popup はピッカーを開いた時点で閉じてしまう。「フォルダを開く」も実現できない。却下
  - **代替案 B: Native Messaging ホスト** → 任意パスへの書き込みも `open` によるフォルダ表示もできるが、ホストのインストーラと常駐プロセスが必要。個人用途の初期段階では過剰。却下（再検討条件）
  - **代替案 C: content script の `<a download>`** → 権限は不要だが、保存先はダウンロード直下固定で、フォルダを開く手段がない。却下
  - **代替案 D: Chrome の既定ダウンロード先を変更** → すべてのダウンロードに影響する。却下
- **影響:**
  - 権限追加により `chrome://extensions` で再読み込み時に権限の再確認が出る
  - data URL（1080p PNG で数 MB）を content script → background に `sendMessage` で渡す。MV3 の service worker では `URL.createObjectURL` が使えないため、blob ではなく data URL で渡す
  - 保存のたびに Chrome のダウンロード表示（バブル）が出る。抑止には `downloads.ui` 権限 + `setUiOptions` が必要で、今回は見送る
  - インストール時 / 再読み込み時に「ダウンロードの管理」の権限警告が出る
  - `src/lib/messages.ts` に `SkipRequest` / `SkipResult` / `FrameRequest` / `FrameResult` / `ScreenshotRequest` / `ScreenshotResult` を追加
- **再検討条件:**
  - 保存先をフォルダ単位で切り替えたい要望 → `local:settings.screenshotDir`（サブフォルダ名）の設定化
  - ダウンロードフォルダ外に置きたい要望が強くなった → 利用者側のシンボリックリンクで足りなければ代替案 B（Native Messaging）を再検討
  - ダウンロードバブルが煩わしい → `downloads.ui` 権限と `setUiOptions` の追加を GDR-EXT で検討
  - PNG のサイズ（4K で 10 MB 超）が問題になった → JPEG（品質 0.92）の選択肢を設定に追加
- **日時:** 2026-09-08T00:00:00+09:00
- **関連:** refines GDR-EXT-001（権限に `downloads` を追加）; depends-on GDR-DOM-002
- **出典:** [notes/20_kaizen/2026-09-08_skip_and_screenshot.md](../../20_kaizen/2026-09-08_skip_and_screenshot.md)
