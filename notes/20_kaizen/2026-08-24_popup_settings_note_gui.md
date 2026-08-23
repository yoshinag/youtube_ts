# 改善提案: offsetSec 設定・note 編集・GUI からの記録

> 雛形: `notes/91_gdr/_reference/templates/T2_BUILDUP_RECORD.md`
> 作成: 2026-08-24

**GDR 一覧:**

| GDR ID | 決定の要約 | status |
|---|---|---|
| GDR-UI-002 | offsetSec の設定と note 編集は popup 内でインライン編集する（options ページは作らない） | Proposed |
| GDR-UI-003 | GUI からの記録は popup の「記録」ボタンで行い、アクティブタブの content script に `capture` を送る。ページ内ボタン注入はしない | Proposed |

---

## 1. GDR（General Decision Record）

**GDR-UI-002: 設定と note は popup 内でインライン編集する**

- **status:** Proposed
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

**GDR-UI-003: GUI からの記録は popup の「記録」ボタンで行う**

- **status:** Proposed
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

---

## 2. 現状

1. `offsetSec` はストレージにあるが UI から変更できない（常に 0）
2. `note` はスキーマにあるが入力手段がない
3. 記録はショートカットのみ。キー衝突時や覚えていないときに記録できない
4. popup は全件表示で、複数配信の記録が混ざる

---

## 3. 改善案

popup を「記録ボタン + 現在の配信の一覧 + 補正値 + インライン note 編集」の 1 画面に拡張する。content script に `info` 応答を追加し、popup が現在の配信を認識できるようにする。

---

## 4. 詳細セクション

### 4.1. メッセージ追加

```ts
export type InfoRequest = { type: "info" };
export type InfoResult = { type: "info:result"; videoId: string | null; hasStreamStart: boolean };
```

### 4.2. popup レイアウト

```
[記録 ▶]  3 件          [コピー][JSON][全削除]
補正 [ -5 ] 秒   ☑ この配信のみ (dQw4w9WgXcQ)
────────────────────────────────────
1:05:02  ここ神 ✎                 ×
0:12:34  （メモを追加）            ×
```

- 「記録」はライブページでないとき disabled + ツールチップ「YouTube のライブ配信ページで開いてください」
- フィルタ中は件数を「M / N 件」と表示し、他の配信の記録が隠れているだけだと分かるようにする
- 記録成功時は一覧が `watch` で即更新される。重複時は status 行に「直前の記録と重複」

### 4.3. 純関数

```ts
export function updateRecord(records, id, patch: Partial<Pick<TimestampRecord, "note">>): TimestampRecord[]
// note が空文字 / undefined なら note キーを削除
export function filterByVideo(records, videoId: string | null): TimestampRecord[]
```

### 4.4. 編集中の再描画

popup 内に `editingId` を持ち、`watch` コールバックは `editingId != null` のとき最新値を `pending` に保留し、編集終了時に `pending` があれば必ず再描画する。

---

## 5. 検討課題

1. **`tabs.query` が popup から返す `id` が `undefined` の場合**（DevTools 等の特殊タブ）
   - 解決策: ボタンを disabled にし status に表示
2. **content script 未注入（拡張更新直後のタブ）で `info` がエラー**
   - 解決策: catch して「ページを再読み込みしてください」を表示
3. **`offsetSec` の入力範囲**
   - 解決策: `-600..600` に clamp。ライブ遅延は通常 数秒〜60 秒程度で十分
4. **「記録」ボタンの基準時刻**
   - popup を開いてからボタンを押すまでの時間が記録位置に乗る。本 GDR では押下時刻（content script の `now()`）を採用。不満が出たら「popup を開いた時刻」基準を再検討

---

## 6. 実行計画

### 6.1. タスク一覧

| # | タスク | 根拠 GDR | 依存 | ステータス |
|---|---|---|---|---|
| 1.1 | `records.ts` に `updateRecord` / `filterByVideo` + テスト | GDR-UI-002, UI-003 | — | 未着手 |
| 1.2 | `messages.ts` に info、content script で応答、`storage.ts` に `patchRecord` / `saveSettings` | GDR-UI-002, UI-003 | 1.1 | 未着手 |
| 1.3 | popup: 記録ボタン・フィルタ・offsetSec 入力・note インライン編集 | GDR-UI-002, UI-003 | 1.2 | 未着手 |
| 1.4 | typecheck / test / build pass、README 更新 | — | 1.3 | 未着手 |
| 2.1 | 実機検証（記録ボタン / 非ライブページでの無効化 / note 編集 / 補正反映） | GDR-UI-002, UI-003 | 1.4 | 未着手 |

### 6.2. フェーズ詳細

#### フェーズ 1: popup 拡張

- [ ] 1.1 純関数 — `src/lib/records.ts` / `records.test.ts`
- [ ] 1.2 メッセージとストレージ — `src/lib/messages.ts` / `entrypoints/youtube.content.ts` / `src/ext/storage.ts`
- [ ] 1.3 popup — `entrypoints/popup/index.html` / `main.ts`
- [ ] 1.4 検証と README

#### フェーズ 2: 実機検証

- [ ] 2.1 手動検証

### 6.3. 進捗サマリー

| フェーズ | タスク数 | 完了 | 残 | コミット |
|---|---|---|---|---|
| 1 | 4 | 0 | 4 | — |
| 2 | 1 | 0 | 1 | — |

---

## 7. ふりかえり

### 7.1. 観察された傾向

（実装後に記入）

### 7.2. 次回への申し送り

- ページ内ボタン注入は不採用（GDR-UI-003 再検討条件）
- ページ内トーストは未実装
