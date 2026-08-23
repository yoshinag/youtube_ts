# GDR-DOM

> YouTube DOM / プレイヤー連携に関する決定。

## GDR-DOM-001: タイムスタンプの一次ソースは実時刻 − 配信開始時刻とする


- **status:** Implemented
- **scope:** arch, spec, perf
- **決定:**
  - 記録する経過秒は `elapsedSec = (capturedAt - streamStartAt) / 1000 + offsetSec` で算出する
    - `capturedAt` = `Date.now()`（ms）
    - `streamStartAt` = `ytInitialPlayerResponse.microformat.playerMicroformatRenderer.liveBroadcastDetails.startTimestamp`（ISO 8601）。content script から `<script>` テキスト or ページ内 JSON として取得する
    - `offsetSec` = 利用者が設定する遅延補正（既定 0、負値で「少し前」を指す）
  - プレイヤー API（`#movie_player.getCurrentTime()`）および MAIN world スクリプト注入は**採用しない**
  - `video.currentTime` 単独、`.ytp-time-current` 等の DOM テキスト解析も採用しない
  - `streamStartAt` が取得できない場合は記録を失敗させ、UI にエラーを返す（推測値で埋めない）
  - レコードには `source: "clock"` を持たせ、将来別ソースを追加しても区別できるようにする
- **理由:**
  - MAIN world 注入を避けることで、拡張構成が content script のみで完結し、YouTube の内部 API 変更への依存を最小化できる（ユーザー合意 2026-08-24）
  - 視聴遅延（数秒〜数十秒）は `offsetSec` で利用者が補正でき、ライブ用途では十分な精度
  - **代替案 A: プレイヤー API 一次 + 実時刻併記録** → 巻き戻し中・一時停止中も正確だが MAIN world 注入が必須で構成が複雑化。レビュー時点の初案だったが、合意フェーズで却下
  - **代替案 B: `video.currentTime`** → ライブではバッファ先頭基準で配信開始基準でない。却下
  - **代替案 C: DOM テキスト（`.ytp-time-current`）解析** → ライブは「-0:12」等の遅延表示になり、ロケール・UI 改変に弱い。却下
  - **代替案 D: 複数ソースの平均 / 多数決** → 過剰設計。却下
- **影響:**
  - 拡張構成（GDR-EXT-001 予定）は ISOLATED world の content script のみを前提にできる
  - レコードのデータモデル（GDR-STORE 系）は `videoId` / `elapsedSec` / `capturedAt` / `streamStartAt` / `offsetSec` / `source` を最低限含む
  - 遅延補正 `offsetSec` の設定 UI が必要（GDR-UI / STORE 系で扱う）
  - DVR で巻き戻して視聴中の記録は「今の実時刻」基準になり、再生位置とは一致しない。仕様として明記する
- **再検討条件:**
  - 巻き戻し視聴中の記録が主要ユースケースになった → プレイヤー API（代替案 A）への切替を再検討
  - `startTimestamp` が取得できない配信形態（プレミア公開・限定公開等）が頻出した → 取得経路の追加、または `video.currentTime` ベースの補完を検討
  - 遅延補正を手動で行うのが煩雑という声が出た → `video.buffered` / `getProgressState` 等による自動推定の検討
  - VOD 化後の時間軸と数十秒以上のずれが常態化した → 開始オフセット補正値の導入を検討
- **日時:** 2026-08-24T00:00:00+09:00
- **関連:** derived-from §2-1, §2-2; relates-to GDR-META-001
- **出典:** [notes/20_kaizen/2026-08-24_timestamp_source.md](../../20_kaizen/2026-08-24_timestamp_source.md)
