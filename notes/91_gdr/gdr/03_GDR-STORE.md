# GDR-STORE

> データ保存・書き出しに関する決定。

## GDR-STORE-001: 記録の永続化スキーマ

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
- **出典:** [notes/20_kaizen/2026-08-24_storage_schema.md](../../20_kaizen/2026-08-24_storage_schema.md)

## GDR-STORE-002: 配信メタを別キーで持ち、記録は videoId で紐づける

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
- **日時:** 2026-08-24T00:00:00+09:00
- **関連:** depends-on GDR-STORE-001
- **出典:** [notes/20_kaizen/2026-08-24_stream_grouping.md](../../20_kaizen/2026-08-24_stream_grouping.md)
