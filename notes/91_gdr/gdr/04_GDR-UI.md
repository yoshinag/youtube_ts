

## GDR-UI-002: 設定と note は popup 内でインライン編集する

- **status:** Accepted
- **scope:** ui, spec
- **決定:**
  - `offsetSec` は popup ヘッダー直下の数値入力（秒、`-600..600`、step 1）で編集し、`change` 時に `local:settings` へ即保存する。options ページは作らない
  - `note` は各行のメモ部分をクリックでテキスト入力に切り替え、Enter / blur で保存、Escape で取り消す。空文字は `note` 削除として扱う
  - レコードの部分更新は `src/lib/records.ts` の `updateRecord(records, id, patch)`（純関数）と `src/ext/storage.ts` の `patchRecord(id, patch)`（直列化済み）で行う
- **理由:**
  - 設定項目が 1 つしかない段階で options ページを作るのは過剰。popup に置けば視聴中にその場で調整できる
  - note は「記録直後に一言添える」用途が主で、一覧の行内で完結するのが最短動線
  - **代替案 A: options ページ** → 設定が増えたら有効だが今は 1 項目。却下（再検討条件）
  - **代替案 B: 記録時にプロンプトで note 入力** → ショートカット記録の即時性を損なう。却下
- **影響:**
  - `Settings` は変更なし（`offsetSec` のみ）。`local:settings` の version は付けないまま（項目追加時に v1 として migration を導入する）
  - popup の行に編集状態が入るため、`watch` による再描画中の編集が失われないよう、編集中は再描画をスキップする
- **再検討条件:**
  - 設定項目が 3 つを超えた → options ページ（代替案 A）へ移行
  - note に複数行・タグ等の構造が必要になった → 編集 UI をダイアログ化
- **日時:** 2026-08-24T00:00:00+09:00
- **関連:** depends-on GDR-STORE-001, GDR-UI-001
- **出典:** [notes/20_kaizen/2026-08-24_popup_settings_note_gui.md](../../20_kaizen/2026-08-24_popup_settings_note_gui.md)

## GDR-UI-003: GUI からの記録は popup の「記録」ボタンで行う

- **status:** Accepted
- **scope:** ui, arch
- **決定:**
  - popup に「記録」ボタンを置く。押下時に `browser.tabs.query({ active: true, currentWindow: true })` でアクティブタブの `id` を取り、`browser.tabs.sendMessage(id, { type: "capture" })` を送る（GDR-EXT-001 のメッセージフローを流用）
  - popup 起動時に `{ type: "info" }` を送り、content script から `{ videoId, hasStreamStart }` を受け取る。ライブページでなければ「記録」ボタンを無効化し理由を表示する
  - 受け取った `videoId` で一覧に「この配信のみ」フィルタ（既定 ON、記録がない場合は全件）を提供する
  - **ページ内ボタンの注入はしない**
  - 権限は追加しない。`tabs.query` は `tabs` 権限なしでも `id` を返す（`url` / `title` は返らないが不要）
- **理由:**
  - ショートカットはキー衝突や記憶の問題があり、明示的なボタンが欲しいというユーザー要望（2026-08-24）
  - popup からなら **既存のメッセージフローと権限のまま**実現でき、YouTube の DOM 構造に依存しない
  - **代替案 A: プレイヤー付近にボタンを注入** → 最短動線だが YouTube の DOM / CSS 変更で壊れやすく、GDR-EXT-001 で「content script は記録時のみ動作」とした perf 方針にも反する。却下（再検討条件）
  - **代替案 B: `chrome.action.onClicked`（アイコンクリックで即記録）** → popup と排他で一覧が出せなくなる。却下
- **影響:**
  - `src/lib/messages.ts` に `InfoRequest` / `InfoResult` を追加
  - content script は `info` にも応答する（DOM 読み取りのみ、常駐なし）
  - popup を開く → ボタン押下までの数百 ms は `offsetSec` で吸収できる範囲
- **再検討条件:**
  - 「popup を開く手間」が不満として挙がった → ページ内ボタン注入（代替案 A）を GDR-DOM / GDR-UI で再検討
  - Firefox 対応 → `tabs.query` の挙動差を確認

- **日時:** 2026-08-24T00:00:00+09:00
- **関連:** depends-on GDR-EXT-001, GDR-STORE-001, GDR-UI-001
- **出典:** [notes/20_kaizen/2026-08-24_popup_settings_note_gui.md](../../20_kaizen/2026-08-24_popup_settings_note_gui.md)
