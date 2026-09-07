# 改善提案: 再生位置のスキップと現在フレームのスクリーンショット保存

> 雛形: `notes/91_gdr/_reference/templates/T2_BUILDUP_RECORD.md`
> 作成: 2026-09-08

**GDR 一覧:**

| GDR ID | 決定の要約 | status |
|---|---|---|
| GDR-DOM-002 | スキップとフレーム取得は `<video>` 要素を直接操作する（`currentTime` 加減算 / `canvas.drawImage`）。記録・スクショの経過秒は「実時刻 − 配信開始」から `seekable.end − currentTime`（ライブ端からの遅れ）を引いて再生位置に追従させる | Implemented |
| GDR-DOM-003 | 配信中でない動画（アーカイブ / 通常動画）は `video.currentTime` を経過秒にする（`source: "position"`、補正なし）。判定は `liveBroadcastDetails.isLiveNow` | Implemented |
| GDR-EXT-002 | スクリーンショットは `downloads` 権限で `Downloads/ss/` に保存する（絶対パス指定は不可。別の場所に置きたい場合は利用者側でシンボリックリンク）。「フォルダを開く」は `downloads.show` | Implemented |

---

## 1. GDR（General Decision Record）

**GDR-DOM-002: スキップとフレーム取得は `<video>` 要素を直接操作し、経過秒は再生位置に追従させる**

- **status:** Implemented
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

**GDR-DOM-003: 配信中でない動画は再生位置を経過秒にする**

- **status:** Implemented
- **scope:** spec, arch
- **決定:**
  - `ytInitialPlayerResponse.microformat.playerMicroformatRenderer.liveBroadcastDetails.isLiveNow`（無ければ `videoDetails.isLive`）が `true` かつ配信開始時刻があるときだけ「ライブ」とし、GDR-DOM-001/002 の実時刻方式で記録する
  - それ以外（アーカイブ = `isLiveNow: false`、通常動画 = `liveBroadcastDetails` なし）は `video.currentTime` をそのまま経過秒にし、`source: "position"`、`offsetSec: 0` で記録する。`streamStartAt` はあれば残し、無ければ `null`（スキーマは v2 のまま。既存データはすべて文字列なので migration 不要）
  - `InfoResult.hasStreamStart` を `mode: "live" | "vod" | null` に置き換え、popup は `vod` でも「● 記録」を有効にする。「補正」入力は `live` のときだけ有効
  - スキップ・スクショ・スクショ同時記録は `mode` に関係なく `<video>` があれば動く
- **理由:**
  - アーカイブでは「実時刻 − 配信開始」が日単位の値になり無意味だった（2026-09-08 ユーザー要望「ライブだけでなくアーカイブにも」で顕在化）。VOD の時間軸は `watch?v=&t=` と一致する `currentTime` が正
  - ライブ判定に `isLiveNow` を使うのは、配信開始時刻の有無だけではアーカイブ（開始時刻が残る）を区別できないため
  - **代替案 A: アーカイブでも `実時刻 − 開始時刻 − behindLive` を使う** → `seekable.end` が動画長になるため数式上は動くが、「今」が配信終了後なので値が破綻する。却下
  - **代替案 B: VOD は記録対象外のまま** → スキップ / スクショが VOD で動くのに記録だけできないのは不自然。却下
- **影響:**
  - `TimestampSource` に `"position"`、`TimestampRecord.streamStartAt` / `StreamMeta.streamStartAt` が `string | null`
  - `StreamInfoProvider` に `isLiveNow?()` / `currentTime?()`。未実装のプロバイダは従来どおり「開始時刻があればライブ」
  - `TimestampErrorReason` に `"position unavailable"`
- **再検討条件:**
  - `isLiveNow` が取れない配信形態（プレミア公開など）で誤判定が出た → `videoDetails.isLiveContent` / `.ytp-live-badge` の併用
  - アーカイブのタイムスタンプを「配信開始基準」に換算したい要望 → `endTimestamp` と動画長から先頭トリム量を推定
- **日時:** 2026-09-08T00:00:00+09:00
- **関連:** refines GDR-DOM-001（`source: "position"` の追加）; depends-on GDR-DOM-002

**GDR-EXT-002: スクリーンショットは `downloads` 権限で `Downloads/ss/` に保存する**

- **status:** Implemented
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

---

## 2. 現状

1. 再生位置の微調整は YouTube 標準の `←` / `→`（5 秒）と `J` / `L`（10 秒）しかなく、0.1 秒・1 秒単位で「その瞬間」に合わせられない
2. 気になった瞬間の画を残す手段がなく、OS のスクリーンショットではプレイヤーの UI ごと写る
3. 記録の経過秒は実時刻基準（GDR-DOM-001）なので、巻き戻して確認した位置で記録しても「今」の値になる。スキップ機能を足すとこのずれが顕在化する

---

## 3. 改善案

popup に「再生」ツールバー（12 個のスキップボタン）と「📷 スクショ」「フォルダを開く」を追加する。content script は `<video>` に対する `skip` / `frame` 要求に応え、background が `downloads` API で `Downloads/ss/` に保存する。記録とスクショの経過秒は `seekable.end − currentTime` で再生位置に追従させる。

---

## 4. 詳細セクション

### 4.1. popup

```
[● 記録] [📷] [📁]  12 件            [コピー][JSON][全削除]
補正 [ -5 ] 秒
戻す  5m  1m  30s  10s  1s  0.1s │ 0.1s  1s  10s  30s  1m  5m  進む
▼ 【現在】○○ 24時間耐久配信  5 件 · 21:30   [コピー][削除]
...
（status）ライブより 32.4 秒前 / ss/20260908-213045_dQw4w9WgXcQ_1h05m02.3s.png を保存
```

- スキップボタンは `<video>` があるページで有効（ライブでなくても可）。`info` に `hasVideo` を追加して判定する
- 押すたびに status に「ライブより N 秒前」（`behindLiveSec`、VOD なら「位置 h:mm:ss」）を出し、今どこにいるか分かるようにする
- 「📷」は保存後に status へファイル名を出す。「📁」は最新のスクショを Finder で表示する
- ボタンは popup を開いたまま連打できる。ショートカット `Alt+Shift+S` は popup を開かずに保存でき、バッジに 1.5 秒だけ `SS` を出して元に戻す（`getBadgeText` で元の文字列を保持）
- 12 個が 1 行に収まらなければ `flex-wrap` で 2 行にする。「戻す」「進む」のラベルを削り `-5m` / `+5m` 表記にしてもよい

### 4.2. メッセージ（`src/lib/messages.ts`）

```ts
type SkipRequest = { type: "skip"; deltaSec: number };
type SkipResult = { type: "skip:result"; ok: true; currentTime: number; behindLiveSec: number | null } | { type: "skip:result"; ok: false; error: "video unavailable" };
type FrameRequest = { type: "frame" };
type FrameResult = { type: "frame:result"; ok: true; dataUrl: string; width: number; height: number; videoId: string | null; elapsedSec: number }
                 | { type: "frame:result"; ok: false; error: "video unavailable" | "frame unavailable" };
type ScreenshotRequest = { type: "screenshot" };            // popup → background
type ScreenshotResult = { type: "screenshot:result"; ok: true; filename: string; downloadId: number } | { type: "screenshot:result"; ok: false; error: string };
```

### 4.3. 純関数（`src/lib/`）

```ts
// timestamp/index.ts
interface StreamInfoProvider { ...; behindLiveSec?(): number | null }
captureTimestamp(p, offsetSec)   // elapsedSec から behindLiveSec を引く。record.behindLiveSec に保存

// player.ts（新規）
SKIP_STEPS = [0.1, 1, 10, 30, 60, 300]
behindLive(seekableEnd: number | null, currentTime: number): number | null   // 範囲外は null
clampSeek(target: number, seekableEnd: number | null): number
screenshotFilename(videoId: string | null, elapsedSec: number, date: Date): string
   // → "20260908-213045_dQw4w9WgXcQ_1h05m02.3s.png"（秒は 0.1 秒刻み。videoId なしなら "novideo"）
isSkipStep(deltaSec: number): boolean   // ±SKIP_STEPS 以外は content script が拒否
```

### 4.4. content script

```ts
function video(): HTMLVideoElement | null
function skip(deltaSec): SkipResult        // currentTime = clampSeek(currentTime + delta, seekableEnd)
async function frame(): Promise<FrameResult>  // readyState >= 2 && videoWidth > 0 を確認 → canvas.drawImage → toBlob(png) → FileReader.readAsDataURL
```

`createDocumentProvider` に `behindLiveSec()` を追加し、`capture()` はそのまま純関数に渡す。

### 4.5. background

```ts
async function screenshot(tabId): Promise<ScreenshotResult> {
  const f = await tabs.sendMessage(tabId, { type: "frame" });
  if (!f?.ok) return { ok: false, error: f?.error ?? "no response" };
  const filename = `ss/${screenshotFilename(f.videoId, f.elapsedSec, new Date())}`;
  const downloadId = await downloads.download({ url: f.dataUrl, filename, conflictAction: "uniquify", saveAs: false });
  return { ok: true, filename, downloadId };
}
```

`onCommand("capture-screenshot")` と `runtime.onMessage(ScreenshotRequest)` の両方から呼ぶ。

### 4.6. スクショと同時に記録（2026-09-08 追加）

📷 / `Alt+Shift+S` は、フレーム取得と同じ計算の経過秒でタイムスタンプも残す（note = ファイル名）。設定なしで常時。1.5 秒以内の連打はスクショだけ保存され記録は重複扱い。ダウンロードが失敗しても記録は残る（ファイル名がメモに残るので手で消せる）

### 4.7. アーカイブ対応（GDR-DOM-003, 2026-09-08 追加）

`info` の `mode` が `vod` なら「● 記録」を有効にし、`currentTime` を記録する。補正入力は無効化。スキップ / スクショは元から `hasVideo` 判定なので変更なし

### 4.8. README

- `downloads` 権限を追加した理由と保存先 `~/Downloads/ss/`（別の場所に置きたい場合のシンボリックリンクを注記）
- `offsetSec` の再調整（ライブ端の遅延が自動で引かれるようになった）

---

## 5. 検討課題

1. **`seekable.end(0)` がライブ端を表すか**
   - YouTube の MSE 実装が `setLiveSeekableRange` 相当を使っていれば正しい。`null` フォールバックは「取れない」場合しか救わず、値が範囲内で間違っている場合は補正が黙って効いて記録がずれる。→ 実装前のタスク 0 で観察して白黒をつける（GDR-DOM-002 決定欄）
2. **`offsetSec` の意味が変わる**
   - 従来はプレイヤー遅延 + 開始時刻の誤差をまとめて吸収していた。今後は開始時刻の誤差だけになる。既存記録は `behindLiveSec` 無し（= 0）なので遡って変わらない
3. **data URL のサイズ**
   - 1080p PNG は 2〜5 MB、4K で 10 MB 超。`sendMessage` の上限（数十 MB）内だが、4K が常用なら JPEG 選択肢を再検討条件で扱う
4. **`downloads.show` の対象ファイルが削除済み**
   - `search` 結果の `exists` を見て、無ければ `showDefaultFolder()` に落とす
5. **ボタン 12 個の幅**
   - popup 最小幅 340px。11px フォントで 1 行に収まる見込み。収まらなければ `flex-wrap` で 2 行にする（実装中に判断）
6. **完了時に残す知見**
   - `offsetSec` の従来値 → 新値、data URL のサイズと `sendMessage` の所要時間（1080p / 1440p）、「📁」が `showDefaultFolder()` に落ちた頻度を `05_knowledge` に記録する

---

## 6. 実行計画

### 6.1. タスク一覧

| # | タスク | 根拠 GDR | 依存 | ステータス |
|---|---|---|---|---|
| 0 | 事前確認: 実機で `seekable.end(0) − currentTime` を観察（ライブ端で一定 / 30 秒戻しで +30 / 一時停止で毎秒 +1）。合意 2026-09-08 により実装後の実機検証（2.1）に統合。崩れていれば `behindLiveSec()` を `null` 固定にして代替案 C へ | DOM-002 | — | 完了（2.1 で確認） |
| 1.1 | `src/lib/player.ts`（`SKIP_STEPS` / `isSkipStep` / `behindLive` / `clampSeek` / `screenshotFilename`）+ テスト。`captureTimestamp` に `behindLiveSec` + テスト | DOM-002 | 0 | 完了 |
| 1.2 | `messages.ts` 拡張、content script の `skip` / `frame` / provider の `behindLiveSec` / `info.hasVideo` | DOM-002 | 1.1 | 完了 |
| 1.3 | `wxt.config.ts` に `downloads` 権限と `capture-screenshot` コマンド、background の `screenshot()` | EXT-002 | 1.2 | 完了 |
| 1.4 | popup: スキップ行、📷 / 📁 ボタン、status 表示 | DOM-002 / EXT-002 | 1.3 | 完了 |
| 1.5 | typecheck / test / build、README（保存先・offset 再調整）、CLAUDE.md の権限記述を更新 | — | 1.4 | 完了 |
| 1.6 | 📷 で同じ瞬間を記録（note = ファイル名） | DOM-002 | 1.4 | 完了 |
| 1.7 | アーカイブ / 通常動画で再生位置を記録（`isLiveNow` 判定、`mode`、補正はライブのみ） | DOM-003 | 1.6 | 完了 |
| 2.1 | 実機検証（`seekable.end − currentTime` がライブ端で安定し 30 秒戻しで +30 になるか、0.1 秒スキップ、一時停止中のスクショ、`~/Downloads/ss/` に保存されるか、フォルダを開く、`Alt+Shift+S`、`offsetSec` の再調整幅、アーカイブで `mode: vod` になり再生位置が記録されるか、通常動画で `streamStartAt: null` の記録が一覧・書き出しで崩れないか） | 全部 | 1.7 | 完了 |

### 6.2. フェーズ詳細

#### フェーズ 0: 事前確認

- [x] 0 `seekable.end` の観察 → 2.1 で確認済み

#### フェーズ 1: 実装 ✅

- [x] 1.1 純関数 — `src/lib/player.ts` / `player.test.ts` / `timestamp/index.ts`
- [x] 1.2 content script — `src/lib/messages.ts` / `timestamp/youtube.ts` / `entrypoints/youtube.content.ts`
- [x] 1.3 background / manifest — `wxt.config.ts` / `entrypoints/background.ts`
- [x] 1.4 popup — `entrypoints/popup/index.html` / `main.ts`
- [x] 1.5 検証と README / CLAUDE.md
- [x] 1.6 スクショ同時記録 — `entrypoints/youtube.content.ts` / `background.ts` / `popup/main.ts`
- [x] 1.7 アーカイブ対応 — `src/lib/timestamp/`（`parseIsLiveNow` / position モード）/ `streams.ts` / `messages.ts` / popup

#### フェーズ 2: 実機検証 ✅

- [x] 2.1 手動検証（2026-09-08、ユーザー報告 OK。`notes/05_knowledge/2026-09-08_実機検証.md`）

### 6.3. 進捗サマリー

| フェーズ | タスク数 | 完了 | 残 | コミット |
|---|---|---|---|---|
| 1 | 7 | 7 | 0 | b19a9bc, 84b882c, 0246fdb, 02fe546, 6671f8b, （1.7 は本コミット） |
| 2 | 1 | 1 | 0 | （実機検証 2026-09-08、コード変更なし） |

---

## 7. ふりかえり

### 7.1. 観察された傾向

- **GDR-DOM-001 の再検討条件が実際に発火した例。** 「巻き戻し視聴中の記録が主要ユースケースになった」に対し、代替案 A（プレイヤー API）へ行かず `seekable.end` で済ませた。MAIN world 注入なしの制約を保ったまま拡張できたが、前提（`seekable.end` = ライブ端）は実機でしか確かめられない。フォールバックを「取れなければ現行動作」に倒しておいたので、外れても壊れる方向にはならない
- **popup の静的 HTML + `data-delta` で 12 ボタンを足した。** view.ts（描画）を触らず main.ts の配線だけで済んだ。ボタンが動的に変わらない限りこれで十分
- **GDR 文書の上書き事故**（INDEX / GDR-STORE / GDR-UI の過去レコード消失）を起票前に発見し復元した（8b4e9ec）。原因は起票時に追記ではなく Write で全置換したこと。今回は Python で末尾追記にした。次回以降も **GDR ファイルは追記のみ** を徹底する
- 保存先の要望（`/Users/yn_mini_0/_works/ss`）は Chrome の制約で直接は満たせず、合意で `~/Downloads/ss/` に落ち着いた。「できないこと」を提案段階で明示したので手戻りなし

- **アーカイブ対応は「実時刻方式が VOD では破綻する」という既存の穴を塞いだ形。** GDR-DOM-001 は暗黙にライブ中だけを想定していた。`source` を最初から持たせてあったので `"position"` の追加だけで済み、既存データの migration も不要だった

### 7.2. 次回への申し送り

- フェーズ 2（実機検証）は 2026-09-08 に完了（ユーザー報告 OK）。`seekable.end` の追従は採用のまま
- `offsetSec` の従来値と新値の差、data URL のサイズと所要時間、📁 のフォールバック頻度（§5-6）は数値未記録。気になったときに `05_knowledge` に追記
- 「全削除後も現在の配信の空セクションが残る」は GDR-UI-005 で撤回・実装済み（`notes/20_kaizen/2026-09-08_empty_current_section.md`）
