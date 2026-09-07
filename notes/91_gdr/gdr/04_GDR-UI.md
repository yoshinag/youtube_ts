# GDR-UI

> popup / options / ページ内 UI に関する決定。

## GDR-UI-001: popup はダークテーマを既定とする

- **status:** Implemented
- **scope:** ui
- **決定:** popup は**ダークテーマのみ**を実装し、`color-scheme: dark` を宣言する。OS のライト設定には追従しない
- **理由:** YouTube のライブ視聴は暗いテーマで行われることが多く、popup が白く光ると視聴を妨げる（ユーザー指示 2026-08-24）。**代替案: `prefers-color-scheme` に追従** → 2 パレット分の保守が要り、現状の画面規模では見合わない。却下
- **影響:** popup の CSS をダーク配色に置き換える。配色トークンは `:root` の CSS 変数に集約し、将来ライト対応する場合の差し替え点を 1 箇所にする
- **再検討条件:** ライトテーマの要望が出た → `prefers-color-scheme` 追従または設定項目の追加を検討
- **日時:** 2026-08-24T00:00:00+09:00
- **関連:** relates-to GDR-EXT-001
- **出典:** [notes/20_kaizen/2026-08-24_storage_schema.md](../../20_kaizen/2026-08-24_storage_schema.md)

## GDR-UI-002: 設定と note は popup 内でインライン編集する

- **status:** Implemented
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

- **status:** Implemented
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

## GDR-UI-004: popup は配信を親、記録を子として表示する

- **status:** Implemented
- **scope:** ui
- **決定:**
  - 一覧は配信ごとのセクション（`<details>`）。ヘッダーにタイトル・件数・最終記録時刻、展開すると記録行
  - 並び順は `lastCapturedAt` 降順。**現在開いている配信は先頭に固定し展開**、他は折りたたみ
  - セクションごとに「コピー」（その配信のテキスト）と「削除」（その配信の記録をすべて削除、確認あり）
  - 「この配信のみ」チェックボックスは廃止（親子表示で役割が吸収される）
  - ヘッダーの「テキストをコピー」「JSON」「全削除」は全件対象として残す
- **理由:**
  - 配信が複数混ざる一覧は、フィルタで隠すより親子で見せる方が「どの配信の何件目か」が常に分かる（ユーザー要望 2026-08-24）
  - `<details>` はネイティブで開閉状態を持ち、JS を増やさずに済む
  - **代替案: 配信一覧 → 詳細画面の 2 画面構成** → popup のサイズでは画面遷移が煩わしい。却下
- **影響:** `main.ts` の描画部を `renderStreams` に置き換え。`filterByVideo` と `filter` UI は削除
- **再検討条件:** 配信セクションが 20 を超えて一覧が長くなった → 検索ボックスまたは「最近 N 件」制限の検討

- **日時:** 2026-08-24T00:00:00+09:00
- **関連:** depends-on GDR-STORE-001, GDR-UI-003; refines GDR-UI-003（フィルタを廃止）; refined-by GDR-UI-005（空セクションの撤回）
- **出典:** [notes/20_kaizen/2026-08-24_stream_grouping.md](../../20_kaizen/2026-08-24_stream_grouping.md)

## GDR-UI-005: 記録が 0 件の配信はセクションを出さない


- **status:** Accepted
- **scope:** ui
- **決定:**
  - `groupRecordsByStream` は記録のある配信だけをグループにする。現在の配信に記録が無くても空グループを先頭に挿入しない
  - 現在の配信に記録があるときの扱い（先頭固定・展開・「現在」バッジ・`info` のタイトルで仮メタを補完）は変えない
  - グループが 0 件なら `#empty` の案内文だけを表示する（文言は「動画ページで ● 記録 / Alt+Shift+T」に合わせて更新）
  - `view.ts` の空グループ用 `li.empty-row` と `EMPTY_MESSAGE` は不要になるので削除する
- **理由:**
  - 「全削除」の直後に現在の配信のセクションが「0 件」で残り、削除されていないように見える（ユーザー報告 2026-09-08）。GDR-UI-004 で空セクションを出した根拠「記録直後に同じ場所へ行が増える」は、記録すればどのみち先頭に現れるので空セクションが無くても成り立つ
  - 記録できるかどうかは「● 記録」ボタンの有効 / 無効で伝わっており、空セクションが担う情報は無い
  - **代替案 A: 全削除の直後だけ空セクションを隠す** → 状態が増え、popup を開き直すとまた出る。却下
  - **代替案 B: 現在の配信名をツールバーに常時表示し、セクションは出さない** → 情報としては悪くないが、幅の狭い popup で 1 行増える。記録が入れば見出しに出るので今は不要。却下（再検討条件）
- **影響:**
  - `src/lib/streams.ts` の `groupRecordsByStream` から空グループ挿入を削除。`current` 引数は先頭固定とタイトル補完のために残す
  - `streams.test.ts` の「現在の配信に記録が無ければ空グループを先頭に置く」系のテストを反転
  - `entrypoints/popup/view.ts` の `EMPTY_MESSAGE` / `empty-row` を削除、`index.html` の `#empty` 文言を更新
- **再検討条件:**
  - 「今どの配信を開いているか」を popup で確認したい要望が出た → 代替案 B（ツールバーに現在の配信名）
- **日時:** 2026-09-08T00:00:00+09:00
- **関連:** refines GDR-UI-004（空セクションの撤回）; relates-to GDR-UI-003
- **出典:** [notes/20_kaizen/2026-09-08_empty_current_section.md](../../20_kaizen/2026-09-08_empty_current_section.md)
