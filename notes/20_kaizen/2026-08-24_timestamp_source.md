# 改善提案: ライブ配信タイムスタンプの取得元を決める

> 雛形: `notes/91_gdr/_reference/templates/T2_BUILDUP_RECORD.md`
> 作成: 2026-08-24

**GDR 一覧:**

| GDR ID | 決定の要約 | status |
|---|---|---|
| GDR-DOM-001 | タイムスタンプの一次ソースは YouTube プレイヤー API（`getCurrentTime()`）、補助として実時刻 + 配信開始時刻を併記録する | Proposed |

---

## 1. GDR（General Decision Record）

**GDR-DOM-001: タイムスタンプの一次ソースはプレイヤー API、実時刻を併記録する**

- **status:** Proposed
- **scope:** arch, spec, perf
- **決定:**
  - 記録するタイムスタンプの **一次ソース** は YouTube 埋め込みプレイヤーオブジェクト（`#movie_player`）の `getCurrentTime()` が返す「配信開始からの経過秒」とする
  - 取得は MAIN world で動作するスクリプトから行い、content script（ISOLATED world）へは `window.postMessage` / CustomEvent で受け渡す
  - 1 レコードには **必ず併せて** `capturedAt`（`Date.now()`, ms）と `streamStartAt`（`ytInitialPlayerResponse.microformat.playerMicroformatRenderer.liveBroadcastDetails.startTimestamp`, ISO 8601）を記録する
  - プレイヤー API が取得できない場合の **フォールバック** は `capturedAt - streamStartAt` による算出値とし、レコードに `source: "player" | "clock"` を持たせて区別する
  - `video.currentTime` 単独、および `.ytp-time-current` 等の DOM テキスト解析は採用しない
- **理由:**
  - 利用者が欲しいのは「配信アーカイブ（VOD）で指し示せる位置」= 配信開始からの経過時間。`getCurrentTime()` は DVR 有効なライブでその値を返し、VOD 化後の時間軸ともほぼ一致する
  - **代替案 A: `video.currentTime`** → ライブではバッファ先頭（DVR ウィンドウ）基準の相対値で、配信開始基準ではない。ページリロードで原点がずれるため単独では使えない。却下
  - **代替案 B: DOM テキスト（`.ytp-time-current`）解析** → ライブ時は「-0:12」のような遅延表示になることがあり、ロケール・UI 改変に弱い。却下
  - **代替案 C: 実時刻 − 配信開始時刻のみ** → プレイヤー注入が不要で単純だが、視聴側の遅延（数秒〜数十秒）と DVR 巻き戻し中の再生位置を反映できない。一次ソースとしては却下、フォールバック兼検証用として併用
  - **代替案 D: 複数ソースの平均 / 多数決** → 過剰設計。ソースを 2 系統に絞り `source` フィールドで区別すれば十分
- **影響:**
  - MAIN world スクリプトの注入が必須になる → 拡張構成（GDR-EXT-001 予定）で `world: "MAIN"` の content script を前提にする
  - レコードのデータモデル（GDR-STORE 系）は `elapsedSec` / `capturedAt` / `streamStartAt` / `source` / `videoId` を最低限含む
  - YouTube の SPA 遷移（`yt-navigate-finish`）で `#movie_player` と `ytInitialPlayerResponse` が差し替わるため、遷移検知が必要（別 GDR-DOM で扱う）
- **再検討条件:**
  - `getCurrentTime()` がライブで配信開始基準でない事例が実機で確認された → `getProgressState()` の `seekableStart` 補正、または実時刻方式への切替
  - YouTube が `#movie_player` のプレイヤー API を非公開化・難読化した → 実時刻方式を一次ソースに昇格
  - DVR 無効配信（巻き戻し不可）の扱いで差異が出た → `source` の第 3 値追加を検討
  - 配信終了後に VOD の時間軸と大きくずれる報告が出た → 開始オフセット補正値の導入を検討
- **日時:** 2026-08-24T00:00:00+09:00
- **関連:** derived-from §2-1, §2-2; relates-to GDR-META-001

---

## 2. 現状

1. ライブ配信視聴中に「この瞬間」を後から VOD で参照できる形（経過時間）で記録する手段がない
2. ブラウザ側で得られる時刻情報は複数あり（`video.currentTime` / プレイヤー API / DOM 表示 / 実時刻）、それぞれ基準点が異なる。取得元を決めないとデータモデルも UI も設計できない
3. content script は ISOLATED world で動作するため、ページ内 JS オブジェクト（プレイヤー）に直接触れない

---

## 3. 改善案

プレイヤー API を一次ソース、実時刻 + 配信開始時刻を併記録するハイブリッド方式を採用する。取得ロジックは純 TS モジュール `src/lib/timestamp/` に切り出し、YouTube 依存部分（DOM / プレイヤー）はインターフェース越しに注入して単体テスト可能にする。

---

## 4. 詳細セクション

### 4.1. 時刻ソースの比較

| ソース | 基準点 | 取得場所 | 長所 | 短所 |
|---|---|---|---|---|
| `player.getCurrentTime()` | 配信開始（DVR） | MAIN world | VOD の時間軸と一致、巻き戻し中も正確 | 注入が必要、非公式 API |
| `video.currentTime` | バッファ先頭 | どちらでも | 標準 API | 配信開始基準でない |
| `.ytp-time-current` | UI 表示 | どちらでも | 注入不要 | 表示形式依存、ライブは「-0:12」表示 |
| `Date.now() - startTimestamp` | 配信開始（実時刻） | どちらでも | 単純・堅牢 | 視聴遅延を含む、巻き戻しを反映できない |

### 4.2. データモデル（最小）

```ts
export type TimestampSource = "player" | "clock";

export interface TimestampRecord {
  videoId: string;
  elapsedSec: number;        // 配信開始からの経過秒
  capturedAt: number;        // Date.now()
  streamStartAt: string | null; // ISO 8601。取得できなければ null
  source: TimestampSource;
  note?: string;
}
```

### 4.3. 取得ロジックの分離

```ts
export interface TimeProvider {
  playerCurrentTime(): number | null;  // MAIN world 側で実装
  streamStartAt(): string | null;
  now(): number;
}

export function captureTimestamp(p: TimeProvider, videoId: string): TimestampRecord {
  const start = p.streamStartAt();
  const now = p.now();
  const fromPlayer = p.playerCurrentTime();
  if (fromPlayer != null && Number.isFinite(fromPlayer) && fromPlayer >= 0) {
    return { videoId, elapsedSec: fromPlayer, capturedAt: now, streamStartAt: start, source: "player" };
  }
  if (start) {
    const elapsed = (now - Date.parse(start)) / 1000;
    return { videoId, elapsedSec: Math.max(0, elapsed), capturedAt: now, streamStartAt: start, source: "clock" };
  }
  throw new Error("no timestamp source available");
}
```

### 4.4. MAIN world ⇔ ISOLATED world の受け渡し

- MAIN world スクリプトが `window.addEventListener("message")` で `{type: "yt-ts:request"}` を受け、`#movie_player.getCurrentTime()` と `ytInitialPlayerResponse` の開始時刻を `{type: "yt-ts:response", ...}` で返す
- content script はリクエスト → レスポンスを Promise 化し、タイムアウト（500ms）時は `playerCurrentTime()` を `null` と扱ってフォールバックに流す

---

## 5. 検討課題

1. **`getCurrentTime()` がライブで配信開始基準かの実機確認**
   - 解決策: 実装後に DVR 有効 / 無効の配信で手動検証し、結果を `notes/05_knowledge/` に記録
   - → フェーズ 2（実機検証）に追加済み
2. **`ytInitialPlayerResponse` は SPA 遷移後に古い値のまま残ることがある**
   - 解決策: `#movie_player.getPlayerResponse?.()` を優先し、なければ `ytInitialPlayerResponse` を参照。遷移検知自体は別 GDR-DOM
   - → フェーズ 1 の MAIN world 実装で考慮
3. **MAIN world 注入のパフォーマンス**
   - 解決策: 常駐監視はせず、記録アクション時のみリクエスト／レスポンスする（ポーリングなし）
   - → 設計方針として §4.4 に反映済み

---

## 6. 実行計画

### 6.1. タスク一覧

| # | タスク | 根拠 GDR | 依存 | ステータス |
|---|---|---|---|---|
| 1.1 | `src/lib/timestamp/` に型・`captureTimestamp` を実装 | GDR-DOM-001 | — | 未着手 |
| 1.2 | `captureTimestamp` の単体テスト（player / clock / 失敗） | GDR-DOM-001 | 1.1 | 未着手 |
| 1.3 | MAIN world 用 provider（`#movie_player` 参照）を実装 | GDR-DOM-001 | 1.1 | 未着手 |
| 2.1 | 実機検証（DVR 有効 / 無効）と知見記録 | GDR-DOM-001 | 1.3, GDR-EXT-001 | 未着手 |

### 6.2. フェーズ詳細

#### フェーズ 1: 取得ロジック

**目的:** YouTube 非依存の純 TS として取得ロジックを実装し、テストで仕様を固定する

- [ ] 1.1 型と `captureTimestamp` — `src/lib/timestamp/index.ts`
- [ ] 1.2 テスト — `src/lib/timestamp/index.test.ts`
- [ ] 1.3 MAIN world provider — `src/lib/timestamp/youtube-provider.ts`（DOM 参照のみ、注入方法は GDR-EXT-001 で確定）

#### フェーズ 2: 実機検証

**目的:** 再検討条件 1 を潰す。GDR-EXT-001（WXT 構成）の完了後に実施

- [ ] 2.1 DVR 有効 / 無効配信での `getCurrentTime()` 挙動確認 → `notes/05_knowledge/`

### 6.3. 進捗サマリー

| フェーズ | タスク数 | 完了 | 残 | コミット |
|---|---|---|---|---|
| 1 | 3 | 0 | 3 | — |
| 2 | 1 | 0 | 1 | — |

---

## 7. ふりかえり

### 7.1. 観察された傾向

（実装後に記入）

### 7.2. 次回への申し送り

- GDR-EXT-001（WXT 構成・MAIN world 注入方法）が未起票。本 GDR の 1.3 / 2.1 はそれに依存する
- SPA 遷移検知は別 GDR-DOM-002 候補
