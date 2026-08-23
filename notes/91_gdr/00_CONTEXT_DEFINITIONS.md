# Context Definitions（前提定義書）

> 雛形: `_reference/templates/T1_CONTEXT_DEFINITIONS.md`
> scope / PREFIX の改廃は本ファイルを直接編集せず、`GDR-META-NNN` を新規発行して反映する。

## 1. プロジェクト情報

- プロジェクト: youtube_ts
- ドメイン: ソフトウェア（ブラウザ拡張）
- 概要: YouTube のライブ配信視聴中に、気になった瞬間のタイムスタンプをワンアクションで記録・一覧・書き出しできる Chrome 拡張（Manifest V3）。TypeScript + WXT で構築する
- 主な関心事: ライブ配信のタイムスタンプ取得（再生位置 / 配信経過時間 / 実時刻の扱い）、YouTube DOM・プレイヤーとの連携、記録の保存と書き出し、拡張内メッセージング
- 技術構成（初期方針）: TypeScript / WXT / Manifest V3 / `chrome.storage`

## 2. scope 定義

| scope | 略記 | 対象 |
|---|---|---|
| `architecture` | `arch` | 拡張の構成（content script / service worker / popup）、メッセージング、データフロー |
| `spec` | `spec` | 機能仕様、タイムスタンプのデータモデル、書き出しフォーマット |
| `ui` | `ui` | popup / options / ページ内オーバーレイのレイアウト・インタラクション |
| `policy` | `pol` | 開発プロセス、コーディング規約、リリース方針、依存更新方針 |
| `performance` | `perf` | DOM 監視コスト、ストレージ書き込み頻度、配信ページへの負荷 |
| `data` | `data` | 記録データの永続化、保持期間、バックアップ・エクスポート |
| `meta` | `meta` | GDR 運用ルール自体の変更、ドキュメント構造 |

> `security` / `product` は現時点で判断頻度が低いため採用しない。必要になれば GDR-META で追加する。

## 3. PREFIX 定義

| PREFIX | ドメイン | 代表的な scope | 用途 |
|---|---|---|---|
| EXT | 拡張構成 | `arch`, `pol` | manifest 設計、エントリポイント分割、メッセージング、権限（permissions）方針 |
| DOM | YouTube DOM / プレイヤー連携 | `arch`, `spec`, `perf` | タイムスタンプの取得元（video 要素 / プレイヤー API / DOM）、SPA 遷移検知、監視方式 |
| UI | UI・UX | `ui`, `spec` | popup / options / ページ内 UI、ショートカット設計 |
| STORE | データ保存・書き出し | `data`, `spec` | `chrome.storage` のスキーマ、保持方針、エクスポート形式 |
| DEP | 依存・ビルド | `pol` | WXT / バンドラ / Lint 等の選定基準、アップデート方針 |
| META | メタ（GDR 運用） | `meta` | GDR 運用ルール自体の変更 |

## 4. 出力先

| ディレクトリ | 用途 |
|---|---|
| `notes/01_spec/` | 仕様書 |
| `notes/05_knowledge/` | 知見ストック（YouTube DOM 調査メモ、WXT の使い方 等） |
| `notes/10_things/` | 横断トピック |
| `notes/20_kaizen/` | 改善提案（`改善提案：` の出力先） |
| `notes/80_bug_fix_report/` | バグレポート（`バグレポート：` の出力先） |
| `notes/91_gdr/` | 本ファイル / `INDEX.md` / `gdr/`（GDR レコード） / `_reference/`（編集禁止スナップショット） / `review/`（横断レビュー） |
| `notes/99_other/` | その他 |
| `notes/_archive/` | 退避領域（AI デフォルト読み込み対象外） |
