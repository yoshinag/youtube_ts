# 改善提案: ストレージのスキーマを決める（+ popup ダークモード既定）

> 雛形: `notes/91_gdr/_reference/templates/T2_BUILDUP_RECORD.md`
> 作成: 2026-08-24

**GDR 一覧:**

| GDR ID | 決定の要約 | status |
|---|---|---|
| GDR-STORE-001 | `local:records` を version 付き単一配列で持ち、`id` 付与・連打重複排除・上限 5000 件・書き込み直列化・JSON / テキストの 2 形式で書き出す | Implemented |
| GDR-UI-001 | popup はダークテーマを既定とする | Implemented |

---

## 1. GDR（General Decision Record）

**GDR-STORE-001: 記録の永続化スキーマ**

- **status:** Implemented
- **scope:** data, spec
- **決定:**
  - キーは `local:records`（`TimestampRecord[]`）と `local:settings`（`Settings`）の 2 つ。WXT `defineItem` の `version` / `migrations` でスキーマ変更を追跡する（現行 v2）
  - `TimestampRecord` に **`id`（`crypto.randomUUID()`）** を追加し、個別削除・重複判定のキーにする。v1（id なし）からの migration で補完する
  - **重複排除:** 同一 `videoId` で直前レコードの `capturedAt` から **1.5 秒以内** の記録は「連打」とみなして捨て、`capture:result` で `duplicate: true` を返す
  - **上限:** 5000 件。超過時は **古い順に削除**し、削除件数を `capture:result.pruned` で返す（黙って消さない）
  - **書き込み直列化:** 追記は content script 内の Promise チェーンで直列化する（同一タブ内の追記同士の競合を排除）。複数タブ同時記録や popup の削除との競合は許容（発生確率が低く、失っても 1 件）
  - **書き出し形式:** 2 種
    - JSON: `{ version, exportedAt, records }` の全件（バックアップ・再インポート用）
    - テキスト: 動画ごとに `h:mm:ss メモ` を 1 行ずつ（YouTube コメント / 概要欄にそのまま貼れる）
  - 変換ロジック（重複判定・上限・テキスト整形）は `src/lib/records.ts` に純関数として置き、vitest で固定する
- **理由:**
  - 1 レコード ≈ 200 B。5000 件で ≈ 1 MB、`chrome.storage.local` の既定上限（10 MB）に対して十分な余裕がありながら `unlimitedStorage` 権限を避けられる（GDR-EXT-001 の最小権限方針）
  - 単一配列は「全件表示」「全件書き出し」が 1 回の読み出しで済み、現状の UI に最も合う
  - **代替案 A: 動画ごとにキー分割（`local:records:<videoId>`）** → 追記の競合範囲が狭まり大規模向きだが、一覧に全キー走査が要り、popup が複雑化。件数規模から不要。却下
  - **代替案 B: IndexedDB** → 容量・クエリ性能は上だが、content script / popup / background それぞれから扱うラッパが必要で過剰。却下
  - **代替案 C: 上限なし** → 10 MB 到達時に書き込みが失敗し記録が黙って落ちる方が害が大きい。却下
  - **代替案 D: 重複排除なし** → ショートカット連打で同じ瞬間が複数記録され、一覧が汚れる。1.5 秒は「意図的な 2 連続記録」を殺さない程度の幅。却下
- **影響:**
  - `TimestampRecord.id` 追加に伴い `captureTimestamp` が `id` を生成する（provider 経由で注入可能にしテスト容易性を保つ）
  - `CaptureResult` に `duplicate` / `pruned` を追加。background はバッジで `=`（重複）を出す
  - popup に「個別削除」「テキストをコピー」「JSON を書き出し」を追加（最小 UI。デザインは GDR-UI 系）
  - 既存の v1 データは migration で `id` を補完する
- **再検討条件:**
  - 5000 件に実際に到達する利用者が出た → 動画ごとのキー分割（代替案 A）か `unlimitedStorage` の検討
  - 複数タブ同時記録で欠損が報告された → background 経由の単一ライターへ集約
  - インポート機能が必要になった → JSON 形式の後方互換ポリシー（version 別読み込み）を GDR 化
  - 他デバイス同期の要望 → `sync` 領域（100 KB）に収まる要約のみ同期する設計の検討
- **日時:** 2026-08-24T00:00:00+09:00
- **関連:** depends-on GDR-EXT-001, GDR-DOM-001

**GDR-UI-001: popup はダークテーマを既定とする**

- **status:** Implemented
- **scope:** ui
- **決定:** popup は**ダークテーマのみ**を実装し、`color-scheme: dark` を宣言する。OS のライト設定には追従しない
- **理由:** YouTube のライブ視聴は暗いテーマで行われることが多く、popup が白く光ると視聴を妨げる（ユーザー指示 2026-08-24）。**代替案: `prefers-color-scheme` に追従** → 2 パレット分の保守が要り、現状の画面規模では見合わない。却下
- **影響:** popup の CSS をダーク配色に置き換える。配色トークンは `:root` の CSS 変数に集約し、将来ライト対応する場合の差し替え点を 1 箇所にする
- **再検討条件:** ライトテーマの要望が出た → `prefers-color-scheme` 追従または設定項目の追加を検討
- **日時:** 2026-08-24T00:00:00+09:00
- **関連:** relates-to GDR-EXT-001

---

## 2. 現状

1. `local:records` は version なしの素の配列で、スキーマ変更時の移行手段がない
2. レコードに識別子がなく、個別削除・重複判定ができない
3. 上限・重複排除・競合の扱いが未定義（GDR-EXT-001 §5-5 で申し送り）
4. 記録を VOD のコメント等に貼る「書き出し」手段がない
5. popup はライト配色で、暗い視聴環境で眩しい

---

## 3. 改善案

純関数のレコード操作（`src/lib/records.ts`）と、WXT `defineItem` の version / migration を組み合わせて、上記 1〜4 を最小構成で解決する。popup はダーク配色に置き換え、個別削除と書き出しを追加する。

---

## 4. 詳細セクション

### 4.1. スキーマ（v2）

```ts
export interface TimestampRecord {
  id: string;            // v2 で追加。crypto.randomUUID()
  videoId: string;
  elapsedSec: number;
  capturedAt: number;
  streamStartAt: string;
  offsetSec: number;
  source: "clock";
  note?: string;
}

export interface Settings { offsetSec: number }

// src/ext/storage.ts
export const recordsItem = storage.defineItem<TimestampRecord[]>("local:records", {
  fallback: [],
  version: 2,
  migrations: { 2: (old: Omit<TimestampRecord, "id">[]) => old.map((r) => ({ ...r, id: crypto.randomUUID() })) },
});
```

WXT は version メタ（`local:records$`）が無い既存値を v1 とみなすため、現行データには migration 2 が適用される。

### 4.2. 追記ポリシー（純関数）

```ts
export const DEDUP_WINDOW_MS = 1500;
export const MAX_RECORDS = 5000;

export interface AppendResult {
  records: TimestampRecord[];
  duplicate: boolean;   // 捨てた場合 true（records は変更なし）
  pruned: number;       // 上限で削除した件数
}

export function appendRecordPure(records, record, opts = { dedupWindowMs, maxRecords }): AppendResult
```

- 重複判定は「同一 `videoId` の**最後の**レコード」との `capturedAt` 差のみを見る。末尾から逆走査して最初に見つかったものと比較するので、配列末尾が別動画でも正しく動く
- 上限超過時は先頭（古い順）から削除

### 4.3. 書き出し

```ts
export function toExportJson(records): string   // { version: 2, exportedAt, records }
export function toExportText(records): string   // videoId ごとにグループ化（最初の記録の capturedAt 順）、各行 "h:mm:ss note"（elapsedSec 昇順）
```

テキスト例:

```
# dQw4w9WgXcQ
0:12:34
1:05:02 ここ神
```

### 4.4. popup の変更

- 各行に「×」（個別削除）
- ヘッダーに「テキストをコピー」（`navigator.clipboard.writeText`）と「JSON を書き出し」（`<a download>` + Blob URL）
- ダーク配色: `:root { color-scheme: dark; --bg: #111; --fg: #eee; --muted: #9a9a9a; --line: #2a2a2a; --accent: #8ab4f8; }`

---

## 5. 検討課題

1. **migration 中の読み書き競合**
   - 解決策: WXT が `getValue` 時に migration を実行する。初回読み出しは popup / content のどちらが先でも同じ結果になる（冪等）
   - → 対応不要。知見として記録
2. **`crypto.randomUUID()` の利用可否**
   - 解決策: content script / popup は secure context（https / 拡張ページ）のため利用可能。lib では provider 経由で注入しテストでは固定値
   - → フェーズ 1 で反映
3. **重複排除が「意図的な連続記録」を殺す**
   - 解決策: 1.5 秒は人が意図して 2 回押す間隔より短い。再検討条件に含めず、問題が出たら settings 化
   - → 方針として §1 に反映済み
4. **JSON 書き出しの `<a download>` が popup で動くか**
   - 解決策: 拡張 popup では動作する。実機検証項目に追加
   - → フェーズ 2

---

## 6. 実行計画

### 6.1. タスク一覧

| # | タスク | 根拠 GDR | 依存 | ステータス |
|---|---|---|---|---|
| 1.1 | `TimestampRecord.id` 追加、`captureTimestamp` で生成（provider 注入）、既存テスト更新 | GDR-STORE-001 | — | 完了 |
| 1.2 | `src/lib/records.ts`（append ポリシー / 書き出し）+ テスト | GDR-STORE-001 | 1.1 | 完了 |
| 1.3 | `src/ext/storage.ts` を v2 + migration + 直列化に更新、`CaptureResult` 拡張、background バッジ | GDR-STORE-001 | 1.2 | 完了 |
| 1.4 | popup: ダーク配色・個別削除・コピー・JSON 書き出し | GDR-STORE-001, GDR-UI-001 | 1.3 | 完了 |
| 1.5 | `wxt build` / test / typecheck pass | GDR-STORE-001 | 1.4 | 完了 |
| 2.1 | 実機検証（migration / 連打 / 書き出し / ダーク表示） | GDR-STORE-001, GDR-UI-001 | 1.5 | 完了 |

### 6.2. フェーズ詳細

#### フェーズ 1: スキーマと UI ✅

- [x] 1.1 `id` 追加 — `src/lib/timestamp/index.ts` / `index.test.ts`
- [x] 1.2 レコード操作 — `src/lib/records.ts` / `records.test.ts`
- [x] 1.3 ストレージ — `src/ext/storage.ts` / `src/lib/messages.ts` / `entrypoints/background.ts` / `youtube.content.ts`
- [x] 1.4 popup — `entrypoints/popup/index.html` / `main.ts`
- [x] 1.5 検証コマンド pass

#### フェーズ 2: 実機検証 ✅

- [x] 2.1 v1 データからの migration、連打、コピー / 書き出し、ダーク表示

### 6.3. 進捗サマリー

| フェーズ | タスク数 | 完了 | 残 | コミット |
|---|---|---|---|---|
| 1 | 5 | 5 | 0 | 7363180, 1653321, 64488fc |
| 2 | 1 | 1 | 0 | （実機検証 2026-08-24、コード変更なし） |

---

## 7. ふりかえり

### 7.1. 観察された傾向

- **純関数への分離が効いた:** 重複排除・上限・書き出し順序はすべて `src/lib/records.ts` のテスト（9 件）で固定でき、拡張 API に触る `src/ext/storage.ts` は薄いまま
- **id の採番を provider 経由にした**ことで `captureTimestamp` のテストが決定的になった（`crypto.randomUUID` 直呼びは既定経路としてのみ残す）
- ダークテーマは CSS 変数 7 つに集約。ライト対応が必要になっても差し替え点は 1 箇所

### 7.2. 次回への申し送り

- フェーズ 2（実機検証）は 2026-08-24 に完了。結果は `notes/05_knowledge/2026-08-24_実機検証.md`
- `note` の編集 UI は未実装（スキーマには存在）。GDR-UI 候補
- `offsetSec` の設定 UI は未実装。GDR-UI 候補
- JSON のインポートは未実装（再検討条件）
