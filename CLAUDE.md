# youtube_ts — プロジェクト指示書

YouTube ライブ配信視聴中のタイムスタンプを記録・一覧・書き出しする Chrome 拡張（Manifest V3）。TypeScript + WXT。

## ディレクトリ構成

- `notes/01_spec/` 仕様書 / `05_knowledge/` 知見 / `10_things/` 横断トピック / `20_kaizen/` 改善提案 / `80_bug_fix_report/` バグレポート / `91_gdr/` GDR / `99_other/` その他
- `notes/91_gdr/00_CONTEXT_DEFINITIONS.md` が前提定義書（scope / PREFIX）。`INDEX.md` が GDR 一覧。レコード本体は `notes/91_gdr/gdr/`
- `notes/91_gdr/_reference/` は上流 `yoshinag/general-decision-record` のスナップショット。**編集禁止**
- `notes/_archive/` は退避領域。**AI はセッション開始時にこのディレクトリを読み込まない**。ユーザーが個別ファイルのパスを明示指定した場合のみ参照する。物理削除はユーザー手動（`rm`）で行う

## GDR 運用

- scope: `arch` / `spec` / `ui` / `pol` / `perf` / `data` / `meta`
- PREFIX: `EXT`（拡張構成・権限） / `DOM`（YouTube DOM・プレイヤー連携） / `UI` / `STORE`（保存・書き出し） / `DEP`（依存・ビルド） / `META`
- ID 形式: `GDR-{PREFIX}-NNN`。scope / PREFIX の改廃は GDR-META を新規発行（前提定義書を直接編集しない）
- 判断の本質が変わる更新は新 GDR を発行して旧を `Superseded` にする（相互リンク必須）
- 文書と実装を混ぜない: 文書 → レビュー → 合意 → 実装 の順

## コンテキスト短縮用キーワード

| キーワード | 動作 | スラッシュコマンド |
|---|---|---|
| `改善提案：[タイトル]` | `notes/20_kaizen/` に T2 構成の改善提案文書を生成 | `/gdr-kaizen` |
| `レビュー：[ファイル名]` | 同位置に `{ファイル名}_reviewed` を生成（引数省略時は自動特定） | `/gdr-review` |
| `レビュー反映：[ファイル名]` | `_reviewed` を本体に統合し削除（引数省略時は最新を第一候補） | `/gdr-apply-review` |
| `バグレポート：[ファイル名]` | `notes/80_bug_fix_report/` にレポート作成（引数省略時はセッションから抽出） | `/gdr-bug-report` |
| `一気通貫：[指示]` | 現在地を判定し 起票 → レビュー → 合意 → GDR → 実装 → 完了処理 をノンストップで前進 | `/gdr-flow` |
| `アーカイブ：[パス]` | `notes/_archive/{元パス}` に `git mv` で退避（引数必須） | `/gdr-archive` |

## 技術構成

- TypeScript / WXT 0.21 / Manifest V3 / Chrome のみ（GDR-EXT-001）
- `entrypoints/`: `youtube.content.ts`（記録）/ `background.ts`（ショートカット受信・バッジ）/ `popup/`（一覧、素の TS）
- `src/lib/`: WXT 非依存の純 TS（vitest 対象）。`timestamp/` 取得、`records.ts` 重複排除・上限・書き出し、`messages.ts` 型。`src/ext/storage.ts`: WXT storage（`local:records` v2 / `local:settings`）と書き込み直列化
- ストレージ: 上限 5000 件・連打 1.5 秒は重複（GDR-STORE-001）。popup はダークテーマのみ（GDR-UI-001）
- 権限は `storage` のみ。`tabs` / `activeTab` / `scripting` / `host_permissions` は追加しない（追加するなら GDR）
- `npm run build` → `dist/chrome-mv3/` / `npm test` / `npm run typecheck`
- タイムスタンプ取得ロジックは `src/lib/timestamp/`（純 TS、`npm test` で vitest）。一次ソースは実時刻 − 配信開始時刻（GDR-DOM-001）
