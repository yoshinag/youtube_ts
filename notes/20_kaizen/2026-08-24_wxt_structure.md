# 改善提案: WXT 構成と権限を決める

> 雛形: `notes/91_gdr/_reference/templates/T2_BUILDUP_RECORD.md`
> 作成: 2026-08-24

**GDR 一覧:**

| GDR ID | 決定の要約 | status |
|---|---|---|
| GDR-EXT-001 | WXT で content script + background + popup の 3 エントリ構成。権限は `storage` のみ、host は `www.youtube.com` の content script match で完結 | Implemented |

---

## 1. GDR（General Decision Record）

**GDR-EXT-001: WXT 3 エントリ構成・最小権限**

- **status:** Implemented
- **scope:** arch, pol
- **決定:**
  - フレームワークは **WXT**（0.21 系）、Manifest V3、ターゲットは Chrome のみ
  - エントリポイントは 3 つ
    - `entrypoints/youtube.content.ts` — `*://www.youtube.com/*` にマッチ、ISOLATED world。タイムスタンプ取得（GDR-DOM-001 のロジック）と保存を担う
    - `entrypoints/background.ts` — service worker。`chrome.commands.onCommand` を受けてアクティブタブの content script に「記録せよ」メッセージを送るだけ
    - `entrypoints/popup/` — 現在タブの記録一覧と補正値の表示。フレームワークなし（素の TS + HTML）
  - 権限は **`storage` のみ**。`host_permissions` / `tabs` / `activeTab` / `scripting` は宣言しない
  - 記録トリガーは `commands`（既定 `Alt+Shift+T`）。manifest の `commands` は権限不要
  - 拡張内メッセージは `{ type: "capture" }` / `{ type: "capture:result", ok, record | error }` の discriminated union を `src/lib/messages.ts` に型定義し、`chrome.runtime.sendMessage` / `chrome.tabs.sendMessage` で送る
  - ストレージは WXT の `wxt/utils/storage` 経由で `local:` 領域を使う（`local:records` = `TimestampRecord[]`、`local:settings` = `{ offsetSec }`）。スキーマの詳細設計は GDR-STORE-001 で扱う
  - `src/lib/` は WXT / `browser` API に依存させない（純 TS のまま vitest で検証）。拡張 API に触るのは `entrypoints/` と `src/ext/` だけ
- **理由:**
  - WXT は manifest 自動生成・HMR・`@types/chrome` 同梱・vitest 連携があり、単独開発者の立ち上げコストが最小（GDR-DOM-001 フェーズ 1 でも vitest を前提にしている）
  - GDR-DOM-001 で MAIN world 注入を不採用にしたため、content script は ISOLATED world だけで完結し `scripting` 権限が不要
  - `tabs` 権限は URL 読み取りに必要だが、videoId は content script 側が `location.href` から取るので不要。`onCommand` のコールバックに `tab` が渡るため `tabs.query` も不要
  - **代替案 A: Vite + CRXJS** → 実績はあるが manifest を手書きする必要があり、WXT と比べて利点がない。却下
  - **代替案 B: background を持たず、content script が `keydown` を直接拾う** → 権限も最小だが、YouTube のキーボードショートカットと競合し、入力欄フォーカス時の扱いも自前になる。却下
  - **代替案 C: popup に React / Svelte を導入** → 一覧表示程度では過剰。UI が複雑化したら GDR-UI で再検討。却下
  - **代替案 D: `chrome.storage.sync`** → 容量上限（100KB）が記録用途に厳しい。却下
- **影響:**
  - ディレクトリは WXT 標準（`entrypoints/` / `src/lib/` / `public/`）。`src/lib/timestamp/` は既存のまま
  - `npm run dev`（`wxt`）/ `npm run build`（`wxt build`）/ `npm test`（vitest）/ `npm run typecheck`
  - content script は記録アクション時のみ動作し、常駐監視はしない（GDR-DOM-001 perf 方針を踏襲）
  - `offsetSec` は当面 `local:settings.offsetSec` から読む（既定 0）。設定 UI は GDR-UI 候補
  - 記録成功時は `browser.action.setBadgeText` で当該タブに件数を表示する（`action` は権限不要）。ページ内トーストは GDR-UI 候補
- **再検討条件:**
  - Firefox 対応を行う → WXT の `browser` 抽象は対応済みだが、`commands` / MV3 background の差異を確認し GDR-EXT を分割
  - SPA 遷移後の再取得で `webNavigation` 等の権限が必要になった → 権限追加の GDR
  - popup の状態管理が肥大化した → UI フレームワーク導入を GDR-UI で検討
  - Chrome Web Store 公開を行う → `prod` scope / `PUB` PREFIX の追加（GDR-META-001 再検討条件）
- **日時:** 2026-08-24T00:00:00+09:00
- **関連:** depends-on GDR-DOM-001; relates-to GDR-META-001

---

## 2. 現状

1. `src/lib/timestamp/` に取得ロジックはあるが、拡張として動かす器（manifest / エントリポイント / ビルド）がない
2. 権限をどこまで要求するかが未決。過剰な権限はストア審査と利用者の信頼を損なう
3. 記録のトリガー（ショートカット / ボタン）と、それを受ける層（background / content）の責務分担が未決

---

## 3. 改善案

WXT で最小の 3 エントリ構成を立て、`storage` 権限のみで「ショートカット → 記録 → popup で一覧」のエンドツーエンドを通す。

---

## 4. 詳細セクション

### 4.1. ディレクトリ構成

```
wxt.config.ts
entrypoints/
  background.ts
  youtube.content.ts
  popup/
    index.html
    main.ts
src/lib/
  timestamp/        # 既存（GDR-DOM-001）。WXT 非依存
  messages.ts       # メッセージ型。WXT 非依存
src/ext/
  storage.ts        # wxt/utils/storage の defineItem（records / settings）
public/
  icon/             # 後で用意。当面は WXT の既定
```

### 4.2. manifest（WXT が生成）

```ts
// wxt.config.ts
export default defineConfig({
  srcDir: ".",
  manifest: {
    name: "YouTube Live Timestamp",
    permissions: ["storage"],
    commands: {
      "capture-timestamp": {
        suggested_key: { default: "Alt+Shift+T" },
        description: "現在のライブ配信のタイムスタンプを記録",
      },
    },
  },
});
```

### 4.3. メッセージフロー

```
[Alt+Shift+T] → background.onCommand(cmd, tab)
              → browser.tabs.sendMessage(tab.id, { type: "capture" })
              → content: captureTimestamp(createDocumentProvider(), offsetSec)
              → appendRecord(record)（wxt/utils/storage）
              → 応答 { type: "capture:result", ok: true, record }
              → background: action.setBadgeText({ tabId, text: String(count) })
popup 起動    → storage.listRecords(videoId of active tab?) ※ 当面は全件を新しい順に表示
```

- popup は `tabs` 権限なしではアクティブタブの URL を読めないため、**当面は全件表示**。タブ別フィルタは GDR-UI で扱う
- 記録成功時のページ内フィードバック（トースト）は GDR-UI 候補。本 GDR では `console.info` のみ

### 4.4. 権限の根拠表

| 権限 | 要否 | 根拠 |
|---|---|---|
| `storage` | 必要 | 記録の永続化 |
| content script `matches` | 必要 | `*://www.youtube.com/*`。これ自体は permission ではなく宣言 |
| `tabs` | 不要 | URL は content 側で取得。`onCommand` に tab が渡る（`tab.url` は読めないが `tab.id` で sendMessage できる） |
| `activeTab` | 不要 | 注入もページ情報取得も行わない |
| `scripting` | 不要 | MAIN world 注入を不採用（GDR-DOM-001） |
| `host_permissions` | 不要 | `fetch` 等のクロスオリジン要求をしない |

---

## 5. 検討課題

1. **`commands` の既定キーが他拡張 / OS と衝突する**
   - 解決策: 利用者が `chrome://extensions/shortcuts` で変更できる旨を README に記載。既定は比較的空いている `Alt+Shift+T`
   - → フェーズ 1 で README に記載
2. **service worker が休止中にコマンドが来る**
   - 解決策: `onCommand` はイベントで SW を起動するため問題なし。状態を SW に持たせない
   - → 設計方針として §4.3 に反映済み
3. **content script 未注入のタブ（YouTube 以外 / リロード前）への sendMessage 失敗**
   - 解決策: background 側で `catch` して無視（ログのみ）
   - → フェーズ 1 の background 実装に反映
4. **popup が storage 変更を即時反映するか**
   - 解決策: `wxt/utils/storage` の `watch` で再描画。軽量なので入れる
   - → フェーズ 1 の popup 実装に反映
5. **append の read-modify-write 競合**
   - 解決策: 連打時に記録が落ちる可能性があるが頻度は低い。スキーマ設計と併せて GDR-STORE-001 で扱う
   - → 既知の制約として申し送り

---

## 6. 実行計画

### 6.1. タスク一覧

| # | タスク | 根拠 GDR | 依存 | ステータス |
|---|---|---|---|---|
| 1.1 | WXT 導入と `wxt.config.ts`、npm scripts、tsconfig 連携 | GDR-EXT-001 | — | 完了 |
| 1.2 | `src/lib/messages.ts` / `src/lib/storage.ts` | GDR-EXT-001 | 1.1 | 完了 |
| 1.3 | `entrypoints/background.ts` / `youtube.content.ts` | GDR-EXT-001, GDR-DOM-001 | 1.2 | 完了 |
| 1.4 | `entrypoints/popup/` 全件一覧 | GDR-EXT-001 | 1.2 | 完了 |
| 1.5 | `wxt build` 成功 + README（読み込み手順・ショートカット変更） | GDR-EXT-001 | 1.3, 1.4 | 完了 |
| 2.1 | 実機検証（Chrome に読み込み、ライブで記録 → popup 表示）。GDR-DOM-001 の 2.1 も同時に実施 | GDR-EXT-001, GDR-DOM-001 | 1.5 | 完了 |

### 6.2. フェーズ詳細

#### フェーズ 1: 器を作る ✅

**目的:** `wxt build` が通り、ショートカット → 記録 → popup 表示が一通りつながる

- [x] 1.1 WXT 導入 — `package.json` / `wxt.config.ts` / `tsconfig.json`（`.wxt/tsconfig.json` を extends し、`vitest/globals` は `compilerOptions.types` で追加。`wxt prepare` を `postinstall` に登録）
- [x] 1.2 共通モジュール — `src/lib/messages.ts` / `src/ext/storage.ts`
- [x] 1.3 エントリ — `entrypoints/background.ts` / `entrypoints/youtube.content.ts`
- [x] 1.4 popup — `entrypoints/popup/index.html` / `main.ts`
- [x] 1.5 ビルド確認と README

#### フェーズ 2: 実機検証 ✅

**目的:** 実ブラウザで動作を確認し、GDR-DOM-001 再検討条件 2（取得できない配信形態）も潰す

- [x] 2.1 手動検証 → `notes/05_knowledge/` に記録

### 6.3. 進捗サマリー

| フェーズ | タスク数 | 完了 | 残 | コミット |
|---|---|---|---|---|
| 1 | 5 | 5 | 0 | b68ecba |
| 2 | 1 | 1 | 0 | （実機検証 2026-08-24、コード変更なし） |

---

## 7. ふりかえり

### 7.1. 観察された傾向

- **実装からの発見:** `createDocumentProvider` は `src/lib/timestamp/youtube.ts` にあり `index.ts` から再エクスポートしていなかった。lib の公開面を `index.ts` に集約するか、用途別に分けるかは未決のまま（小さいので現状維持）
- **過剰設計の回避:** popup のタブ別フィルタには `tabs` 権限が要るため、権限最小を優先して全件表示に留めた
- `wxt build` 生成の manifest で `permissions: ["storage"]` のみ、`host_permissions` なしを確認

### 7.2. 次回への申し送り

- フェーズ 2（実機検証）は 2026-08-24 に完了。結果は `notes/05_knowledge/2026-08-24_実機検証.md`
- ストレージのスキーマ（上限・重複・append 競合・エクスポート形式）は GDR-STORE-001 で確定する
- popup のタブ別フィルタ・トースト・設定 UI（`offsetSec`）は GDR-UI 候補
- アイコン未設定（WXT 既定）。公開前に `public/icon/` を用意
- （2026-09-08 追記）「権限は `storage` のみ」は GDR-EXT-002 で `downloads` を追加して refine（スクショ保存 / フォルダ表示）。`tabs` / `activeTab` / `scripting` / `host_permissions` は引き続きなし
