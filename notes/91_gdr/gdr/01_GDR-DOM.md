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
- **関連:** derived-from §2-1, §2-2; relates-to GDR-META-001; refined-by GDR-DOM-002（`behindLiveSec` 補正）
- **出典:** [notes/20_kaizen/2026-08-24_timestamp_source.md](../../20_kaizen/2026-08-24_timestamp_source.md)

## GDR-DOM-002: スキップとフレーム取得は `<video>` 要素を直接操作し、経過秒は再生位置に追従させる


- **status:** Accepted
- **scope:** arch, spec
- **決定:**
  - content script が `document.querySelector("video.html5-main-video") ?? document.querySelector("video")` を対象に、`video.currentTime += deltaSec` でスキップする。`deltaSec` は ±0.1 / 1 / 10 / 30 / 60 / 300 の 12 種。結果は `[0, seekable.end]` にクランプする（ブラウザ側でも同等に丸められる）
  - フレーム取得は `canvas.drawImage(video)` → `canvas.toBlob("image/png")` → data URL。解像度は `video.videoWidth × videoHeight`（再生中の画質そのまま）。`readyState < 2`（HAVE_CURRENT_DATA 未満）または `videoWidth === 0` のときは `"frame unavailable"` を返す
  - **再生位置への追従:** `behindLiveSec = video.seekable.end(0) − video.currentTime` を「ライブ端からの遅れ」とみなし、記録・スクショの経過秒を `elapsedSec = (now − streamStartAt) / 1000 − behindLiveSec + offsetSec` とする。`seekable` が空、または値が `[0, 43200]`（DVR 上限 12 時間）を外れるときは `behindLiveSec = 0`（= 現行動作）。`TimestampRecord` に `behindLiveSec?: number` を追加する（省略時 0。任意フィールドなので schema version は据え置き）
  - `source` は `"clock"` のまま（一次ソースは実時刻のまま、補正項が増えただけ）
  - **前提の事前確認（タスク 0）:** 実装前に DevTools で `seekable.end(0) − currentTime` を数十秒観察し、(a) ライブ端でほぼ一定（揺れ ±1 秒以内）、(b) 30 秒戻すと約 30 増える、(c) 一時停止中に毎秒 1 増える、を確認する。(a) が崩れる（セグメント追加ごとに数秒跳ねる）場合は**追従を採用せず代替案 C（実時刻のみ、現行どおり）に戻す**。閾値を超えたときだけ補正する方式は不連続で説明しにくいため採らない
  - MAIN world 注入・プレイヤー API（`seekTo` / `getCurrentTime`）・キーボードイベント合成は使わない
- **理由:**
  - `<video>` は ISOLATED world からそのまま触れ、YouTube の内部 API に依存しない（GDR-DOM-001 / EXT-001 の方針を踏襲）
  - スキップ機能を付けると「少し戻して確認してから記録 / スクショ」が主要ユースケースになる。GDR-DOM-001 の再検討条件「巻き戻し視聴中の記録が主要ユースケースになった」に該当するが、`seekable.end` を使えば MAIN world 注入なしで再生位置に追従でき、代替案 A（プレイヤー API）へ切り替える必要がない
  - **代替案 A: キーボードイベント合成（`J` / `L` / `←` / `→`）** → 刻みが 5 / 10 秒固定で 0.1 秒刻みができない。入力欄フォーカス時の扱いも自前。却下
  - **代替案 B: プレイヤー API `#movie_player.seekTo()` / `getCurrentTime()`** → MAIN world 注入が必要（GDR-DOM-001 で却下済み）。却下
  - **代替案 C: 記録は実時刻基準のまま（追従しない）** → 実装は最小だが、30 秒戻して記録すると 30 秒ずれた値が残り、スキップ機能の意味が薄れる。却下
  - **代替案 D: スクショは `chrome.tabs.captureVisibleTab`** → `activeTab` 権限が要り、コントロールバーやコメント欄も写る。フレームだけ欲しい用途に合わない。却下
- **影響:**
  - ライブ端で視聴中も `behindLiveSec` はプレイヤー遅延分（数秒）だけ正になるため、**既存の `offsetSec` はその分だけ再調整が必要**（従来 `-10` にしていた人は `-5` 程度になる想定）。README に明記する
  - `StreamInfoProvider` に `behindLiveSec(): number | null` を追加。`captureTimestamp` の純関数とテストを拡張
  - 一時停止中でも `currentTime` 加減算・`drawImage` は有効なので、「一時停止 → 0.1 秒刻み → スクショ」でコマ送りができる
  - DRM 付き動画（EME）は `drawImage` が失敗する。ライブ配信では通常発生しないため、エラーを UI に返すだけにする
  - VOD（配信開始時刻なし）でもスキップ / スクショは動かす。スクショのファイル名の経過秒は `video.currentTime` を使う
- **再検討条件:**
  - `seekable.end(0)` がライブ端を正しく示さない配信形態が見つかった → `buffered.end` / `.ytp-live-badge` の状態 / プレイヤー API の再検討
  - 記録の精度（実時刻基準 + 補正）が不足という声が出た → GDR-DOM-001 代替案 A へ
  - スキップの刻みを変えたい要望 → 設定化（`local:settings.skipSteps`）
  - スクショと同時にタイムスタンプも残したい要望 → 「📷」で `capture` も呼ぶ設定の追加
- **日時:** 2026-09-08T00:00:00+09:00
- **関連:** refines GDR-DOM-001（`behindLiveSec` 補正の追加）; depends-on GDR-EXT-001; relates-to GDR-UI-003
- **出典:** [notes/20_kaizen/2026-09-08_skip_and_screenshot.md](../../20_kaizen/2026-09-08_skip_and_screenshot.md)
