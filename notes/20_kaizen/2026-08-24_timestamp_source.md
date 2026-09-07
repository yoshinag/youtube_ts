# 改善提案: ライブ配信タイムスタンプの取得元を決める

> 雛形: `notes/91_gdr/_reference/templates/T2_BUILDUP_RECORD.md`
> 作成: 2026-08-24

**GDR 一覧:**

| GDR ID | 決定の要約 | status |
|---|---|---|
| GDR-DOM-001 | タイムスタンプの一次ソースは実時刻 − 配信開始時刻。プレイヤー API / MAIN world 注入は採用しない | Implemented |

---

## 1. GDR（General Decision Record）

**GDR-DOM-001: タイムスタンプの一次ソースは実時刻 − 配信開始時刻とする**

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

---

## 2. 現状

1. ライブ配信視聴中に「この瞬間」を後から VOD で参照できる形（経過時間）で記録する手段がない
2. ブラウザ側で得られる時刻情報は複数あり（`video.currentTime` / プレイヤー API / DOM 表示 / 実時刻）、それぞれ基準点が異なる。取得元を決めないとデータモデルも UI も設計できない
3. content script は ISOLATED world で動作するため、ページ内 JS オブジェクト（プレイヤー）に直接触れない。触るには MAIN world 注入が必要で構成が複雑化する

---

## 3. 改善案

実時刻 − 配信開始時刻を一次ソースとする単純方式を採用する。取得ロジックは純 TS モジュール `src/lib/timestamp/` に切り出し、YouTube 依存部分（配信開始時刻・videoId の取得）はインターフェース越しに注入して単体テスト可能にする。

---

## 4. 詳細セクション

### 4.1. 時刻ソースの比較

| ソース | 基準点 | 取得場所 | 長所 | 短所 |
|---|---|---|---|---|
| `Date.now() - startTimestamp` | 配信開始（実時刻） | ISOLATED world | 単純・堅牢、注入不要 | 視聴遅延を含む（`offsetSec` で補正）、巻き戻しを反映できない |
| `player.getCurrentTime()` | 配信開始（DVR） | MAIN world | 巻き戻し中も正確 | 注入が必要、非公式 API |
| `video.currentTime` | バッファ先頭 | どちらでも | 標準 API | 配信開始基準でない |
| `.ytp-time-current` | UI 表示 | どちらでも | 注入不要 | 表示形式依存、ライブは「-0:12」表示 |

### 4.2. データモデル（最小）

```ts
export type TimestampSource = "clock";

export interface TimestampRecord {
  videoId: string;
  elapsedSec: number;         // 配信開始基準の経過秒（offset 適用後）
  capturedAt: number;         // Date.now()
  streamStartAt: string;      // ISO 8601
  offsetSec: number;          // 適用した遅延補正
  source: TimestampSource;
  note?: string;
}
```

### 4.3. 取得ロジックの分離

```ts
export interface StreamInfoProvider {
  videoId(): string | null;        // URL の v= パラメータ等
  streamStartAt(): string | null;  // ytInitialPlayerResponse から
  now(): number;
}

export function captureTimestamp(p: StreamInfoProvider, offsetSec = 0): TimestampRecord {
  const videoId = p.videoId();
  if (!videoId) throw new TimestampError("videoId unavailable");
  const start = p.streamStartAt();
  const startMs = start ? Date.parse(start) : NaN;
  if (!Number.isFinite(startMs)) throw new TimestampError("streamStartAt unavailable");
  const now = p.now();
  const elapsedSec = Math.max(0, (now - startMs) / 1000 + offsetSec);
  return { videoId, elapsedSec, capturedAt: now, streamStartAt: start!, offsetSec, source: "clock" };
}
```

### 4.4. 配信開始時刻の取得（content script）

- `ytInitialPlayerResponse` は ISOLATED world から直接参照できないため、`document.scripts` 中の `var ytInitialPlayerResponse = {...};` を正規表現で切り出して `JSON.parse` する
- SPA 遷移後はこのスクリプトが更新されないため、遷移検知（別 GDR-DOM）後は `https://www.youtube.com/watch?v=...` の再フェッチ、または `ytd-watch-flexy` 要素のプロパティ参照に切り替える。本 GDR では「初期ロード時の取得」のみ対象
- 常駐監視・ポーリングは行わず、記録アクション時のみ読む

---

## 5. 検討課題

1. **`ytInitialPlayerResponse` は SPA 遷移後に古い値のまま残る**
   - 解決策: 本 GDR では初期ロード時のみ対象。遷移後の再取得は GDR-DOM-002 候補
   - → 申し送りに記載
2. **視聴遅延の補正**
   - 解決策: `offsetSec` を利用者設定にする（既定 0）。自動推定は再検討条件
   - → §4.3 に反映済み
3. **テストランナー**
   - 解決策: vitest を採用（WXT 公式も vitest 前提）。GDR 化しない
   - → フェーズ 1 で導入

---

## 6. 実行計画

### 6.1. タスク一覧

| # | タスク | 根拠 GDR | 依存 | ステータス |
|---|---|---|---|---|
 | 1.1 TS / vitest の最小セットアップ | GDR-DOM-001 | — | 未着手 |
 | 1.2 `src/lib/timestamp/` に型・`captureTimestamp` を実装 | GDR-DOM-001 | 1.1 | 未着手 |
 | 1.3 `captureTimestamp` の単体テスト（正常 / offset / 欠損 / 不正 ISO） | GDR-DOM-001 | 1.2 | 未着手 |
 | 1.4 `parseStreamStartAt(html)` — ページ HTML/script から開始時刻を抽出する純関数 + テスト | GDR-DOM-001 | 1.1 | 未着手 |
| 2.1 | 実機検証（ライブ / プレミア公開 / VOD 化後の時間軸）と知見記録 | GDR-DOM-001 | GDR-EXT-001 | 完了 |

### 6.2. フェーズ詳細

#### フェーズ 1: 取得ロジック ✅

**目的:** YouTube 非依存の純 TS として取得ロジックを実装し、テストで仕様を固定する

- [x] 1.1 セットアップ — `package.json` / `tsconfig.json` / vitest
- [x] 1.2 型と `captureTimestamp` — `src/lib/timestamp/index.ts`
- [x] 1.3 テスト — `src/lib/timestamp/index.test.ts`
- [x] 1.4 開始時刻抽出 — `src/lib/timestamp/youtube.ts` + テスト

#### フェーズ 2: 実機検証 ✅

**目的:** 再検討条件 2（取得できない配信形態）を潰す。GDR-EXT-001（WXT 構成）の完了後に実施

- [x] 2.1 ライブ / プレミア公開 / VOD 化後での `startTimestamp` 取得と時間軸の確認 → `notes/05_knowledge/`

### 6.3. 進捗サマリー

| フェーズ | タスク数 | 完了 | 残 | コミット |
|---|---|---|---|---|
| 1 | 4 | 4 | 0 | 35830e3, 837329c |
| 2 | 1 | 1 | 0 | （実機検証 2026-08-24、コード変更なし） |

---

## 7. ふりかえり

### 7.1. 観察された傾向

- **過剰設計の圧縮:** 初稿はプレイヤー API 一次 + 実時刻併記録 + サニティチェックのハイブリッドだったが、合意フェーズで「実時刻のみ」に圧縮された。MAIN world 注入という構成上のコストが判断を動かした
- **実装からの発見:** `ytInitialPlayerResponse` の切り出しを正規表現で終端推測すると脆いため、引用符を考慮した波括弧マッチ（`extractAssignedObject`）に置き換えた。`window.` 前置形式を識別子境界の正規表現が弾くバグをテストで検出

### 7.2. 次回への申し送り

- GDR-EXT-001（WXT 構成）が未起票。本 GDR の 2.1 はそれに依存する。MAIN world 注入は不要になった
- SPA 遷移後の `streamStartAt` 再取得は GDR-DOM-002 候補
- `offsetSec` の設定 UI / 保存は GDR-UI / GDR-STORE 候補
- （2026-09-08 追記）再検討条件「巻き戻し視聴中の記録が主要ユースケースになった」が発火。プレイヤー API へは行かず `seekable.end − currentTime` で追従する GDR-DOM-002、配信中でない動画は `currentTime` を使う GDR-DOM-003 で refine した（`notes/20_kaizen/2026-09-08_skip_and_screenshot.md`）。SPA 遷移後の再取得は未対応のまま（GDR-DOM-004 候補に繰り下げ）
