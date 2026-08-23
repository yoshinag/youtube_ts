# 改善提案: タイムスタンプを配信別に管理する（配信タイトルを親に）

> 雛形: `notes/91_gdr/_reference/templates/T2_BUILDUP_RECORD.md`
> 作成: 2026-08-24

**GDR 一覧:**

| GDR ID | 決定の要約 | status |
|---|---|---|
| GDR-STORE-002 | 配信メタ（タイトル・チャンネル・開始時刻）を `local:streams` に `videoId` キーで別持ちし、記録は `videoId` で紐づける（記録にタイトルを複製しない） | Implemented |
| GDR-UI-004 | popup は配信をアコーディオンの親、記録を子として表示する。現在の配信を先頭に展開し、「この配信のみ」フィルタは廃止 | Implemented |

---

## 1. GDR（General Decision Record）

**GDR-STORE-002: 配信メタを別キーで持ち、記録は videoId で紐づける**

- **status:** Implemented
- **scope:** data, spec
- **決定:**
  - 新キー `local:streams`: `Record<videoId, StreamMeta>`。`StreamMeta = { videoId, title, channel, streamStartAt, firstCapturedAt, lastCapturedAt }`
  - タイトル・チャンネル名は記録時に `ytInitialPlayerResponse.videoDetails.title` / `.author` から取得し、`document.title`（末尾の ` - YouTube` を除去）をフォールバックにする
  - 記録のたびに `streams[videoId]` を **upsert**（`firstCapturedAt` は保持、`lastCapturedAt` は更新。タイトルは取得できたときのみ上書き）
  - `videoDetails` は `videoDetails.videoId` が URL の `videoId` と一致するときだけ信頼する（SPA 遷移後の古い値で前の動画のタイトルを拾わないため）。不一致・欠損時は `document.title` を使う
  - `TimestampRecord` のスキーマは **変更しない**（v2 のまま）。タイトルは記録に複製しない
  - 記録が 1 件もなくなった配信のメタは削除する（孤児を残さない）
  - 旧データ（`streams` に存在しない `videoId` の記録）は、popup 表示時に `title = videoId` の仮メタとして扱い、次にその配信で記録した時点で本物に置き換わる
  - テキスト書き出しの見出しは `# {title}` に変更し、2 行目に `https://www.youtube.com/watch?v={videoId}` を置く
- **理由:**
  - タイトルは配信に 1 つの属性であり、記録ごとに複製すると改題時に不整合が出る。正規化して別キーに置くのが素直
  - **代替案 A: 各記録に `title` を持たせる** → 実装は最小だが、同一配信の記録が N 件あれば N 回重複し、改題・取得失敗時に混在する。却下
  - **代替案 B: `local:records` を `Record<videoId, { meta, records[] }>` に再構成（v3）** → 一貫性は最高だが、v2 → v3 の migration と `records.ts` の全関数の書き換えが必要で、GDR-STORE-001 から 1 日で大改修になる。却下（再検討条件）
  - **代替案 C: タイトルは表示時に取りに行く** → popup から YouTube に fetch するには `host_permissions` が必要（GDR-EXT-001 違反）。却下
- **影響:**
  - `records` と `streams` の 2 キー更新は非アトミック。記録追加は「records → streams」の順に書き、失敗しても記録が失われない側に倒す
  - `captureTimestamp` の provider に `title()` / `channel()` を追加。`InfoResult` にも `title` を載せる
  - `toExportText` のシグネチャに `streams` を追加
- **再検討条件:**
  - 配信数が数百を超えて popup の描画が重くなった → 代替案 B（配信単位のネスト構造）への v3 移行を検討
  - 改題を履歴として残したい要望 → `StreamMeta.titleHistory` の検討
  - チャンネル単位の階層が必要になった → `local:channels` の追加

**GDR-UI-004: popup は配信を親、記録を子として表示する**

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
- **関連:** depends-on GDR-STORE-001, GDR-UI-003; refines GDR-UI-003（フィルタを廃止）

---

## 2. 現状

1. 記録には `videoId` しかなく、popup では 11 文字の ID で配信を区別するしかない
2. 複数配信の記録が 1 本の一覧に混ざり、フィルタで隠すしかない
3. テキスト書き出しの見出しも `# videoId` で、後から見て何の配信か分からない

---

## 3. 改善案

配信メタを `local:streams` に別持ちし、popup を「配信（親） > 記録（子）」のアコーディオンに作り替える。

---

## 4. 詳細セクション

### 4.1. スキーマ

```ts
export interface StreamMeta {
  videoId: string;
  title: string;
  channel: string | null;
  streamStartAt: string;
  firstCapturedAt: number;
  lastCapturedAt: number;
}
export type StreamMap = Record<string, StreamMeta>;
```

### 4.2. 純関数（`src/lib/streams.ts`）

```ts
upsertStream(streams, record, { title, channel }): StreamMap     // first は保持、last と title は更新
dropOrphanStreams(streams, records): StreamMap                      // 記録のない配信を除去
groupRecordsByStream(records, streams, currentVideoId): StreamGroup[]  // 並び・仮メタ補完
toExportText(records, streams): string                               // 見出しをタイトルに
```

### 4.3. 取得

`youtube.ts` に `parseVideoDetails(scriptText): { videoId, title, author } | null` を追加（`extractAssignedObject` を再利用）。`createDocumentProvider` に `title()` / `channel()` を追加。`videoDetails.videoId` が現在の `videoId` と一致するときだけ採用し、それ以外は `document.title`（` - YouTube` 除去）を返す。

### 4.4. popup

```
[● 記録]  12 件                     [コピー][JSON][全削除]
補正 [ -5 ] 秒
▼ 【現在】○○ 24時間耐久配信    5 件 · 21:30   [コピー][削除]
    1:05:02  ここ神 ✎                     ×
    0:12:34  メモを追加                    ×
▶ △△ 雑談枠                     3 件 · 昨日   [コピー][削除]
▶ dQw4w9WgXcQ（タイトル未取得）   4 件 · 8/20  [コピー][削除]
```

- 現在の配信に記録が 0 件でも、`info` のタイトルで空セクションを先頭に出す（記録直後に同じ場所へ行が増える）
- 配信単位の削除はタイトルを含めて確認する（「『○○』の 5 件を削除しますか？」）

---

## 5. 検討課題

1. **`records` と `streams` の非アトミック更新**
   - 解決策: records を先に書く。streams の書き込み失敗は次回記録時の upsert で回復する
2. **タイトルが取れない配信（SPA 遷移後の古い `ytInitialPlayerResponse`）**
   - 解決策: `document.title` をフォールバック。SPA 遷移の根本対応は GDR-DOM-002 候補のまま
3. **`<details>` の開閉状態が popup を閉じると失われる**
   - 解決策: 現在の配信だけ常に展開。他は折りたたみ既定で妥当。必要なら `sessionStorage` で保持

---

## 6. 実行計画

### 6.1. タスク一覧

| # | タスク | 根拠 GDR | 依存 | ステータス |
|---|---|---|---|---|
| 1.1 | `parseVideoDetails` + provider の `title()` / `channel()` + テスト | GDR-STORE-002 | — | 完了 |
| 1.2 | `src/lib/streams.ts`（upsert / orphan / group / export）+ テスト。`records.ts` の旧 `toExportText` / `groupByVideo` / `filterByVideo` は削除して一本化 | GDR-STORE-002 | 1.1 | 完了 |
| 1.3 | `storage.ts` に `streamsItem`、`appendRecord` / `deleteRecord` / `deleteStream` で整合を保つ。`InfoResult` / `CaptureRequest` 拡張 | GDR-STORE-002 | 1.2 | 完了 |
| 1.4 | popup をアコーディオン表示に置換、フィルタ削除 | GDR-UI-004 | 1.3 | 完了 |
| 1.5 | typecheck / test / build、README | — | 1.4 | 完了 |
| 2.1 | 実機検証（タイトル取得、旧記録の仮メタ表示、配信単位の削除 / コピー） | 両方 | 1.5 | 完了 |

### 6.2. フェーズ詳細

#### フェーズ 1: 配信別管理 ✅

- [x] 1.1 取得 — `src/lib/timestamp/youtube.ts` / `youtube.test.ts`
- [x] 1.2 純関数 — `src/lib/streams.ts` / `streams.test.ts` / `records.ts`
- [x] 1.3 ストレージ・メッセージ — `src/ext/storage.ts` / `src/lib/messages.ts` / `entrypoints/youtube.content.ts`
- [x] 1.4 popup — `entrypoints/popup/`
- [x] 1.5 検証と README

#### フェーズ 2: 実機検証 ✅

- [x] 2.1 手動検証

### 6.3. 進捗サマリー

| フェーズ | タスク数 | 完了 | 残 | コミット |
|---|---|---|---|---|
| 1 | 5 | 5 | 0 | dffdc80, 143a644, a09ef01, ecff0d2 |
| 2 | 1 | 1 | 0 | （実機検証 2026-08-24、コード変更なし） |

---

## 7. ふりかえり

### 7.1. 観察された傾向

- **実装からの発見:** `groupRecordsByStream` で「現在の配信を先頭へ移動」と「仮メタのタイトル補完」を別分岐に書いたため、移動ケースで補完が抜けた。テストが先に検出した（純関数 + テストの方針が効いている）
- **記録スキーマを据え置いた**ことで migration ゼロで済んだ。`streams` は記録から再構築可能な派生データに近く、欠けても表示が `videoId` に落ちるだけで壊れない
- popup `main.ts` は約 230 行。次に機能を足すなら描画部（`renderGroup` / `renderRow`）を別ファイルに分ける

### 7.2. 次回への申し送り

- フェーズ 2（実機検証）は 2026-08-24 に完了。結果は `notes/05_knowledge/2026-08-24_実機検証.md`
- 配信単位のネスト構造（v3）は見送り。配信数が増えたら再検討
- popup 描画部の分割は実施済み（`entrypoints/popup/view.ts`、GDR 不要の実装詳細として扱った）
