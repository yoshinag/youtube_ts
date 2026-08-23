

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
