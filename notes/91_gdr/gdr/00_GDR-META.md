# GDR-META

## GDR-META-001: GDR 運用の scope と PREFIX を確定する

- **status:** Implemented
- **scope:** meta
- **日付:** 2026-08-24
- **決定:**
  - scope は `arch` / `spec` / `ui` / `pol` / `perf` / `data` / `meta` の 7 種を採用する
  - PREFIX は `EXT` / `DOM` / `UI` / `STORE` / `DEP` / `META` の 6 種を採用する
  - GDR 出力先は推奨標準（`notes/{01_spec,05_knowledge,10_things,20_kaizen,80_bug_fix_report,91_gdr,99_other}/` + `notes/_archive/`）に従う
  - 短縮キーワードは既定 6 種（改善提案 / レビュー / レビュー反映 / バグレポート / 一気通貫 / アーカイブ）を採用し、プロジェクト固有キーワードは現時点で追加しない
- **理由:**
  - 本プロジェクトは「ライブ配信のタイムスタンプ取得」が核であり、判断の中心は **どこから時刻を取るか（DOM）** と **どう保存・書き出すか（STORE）** になる。この 2 つを独立 PREFIX にすると INDEX での検索性が高い
  - Chrome 拡張は content script / service worker / popup の分割と権限設計が固有の判断領域なので `EXT` を設ける
  - `security` scope / `SEC` PREFIX は、外部通信・認証を持たない単体拡張のため現時点では不要
  - 代替案 A: 最小構成 `EXT` / `UI` / `META` → DOM とストレージの判断が `EXT` に混在し、後から分割する手間が大きいため却下
  - 代替案 B: 上流の共通 PREFIX（INFRA / PERF / LOG …）をそのまま採用 → 拡張開発には粒度が合わず、使われない PREFIX がノイズになるため却下
- **影響:**
  - 以降の GDR は `GDR-{EXT|DOM|UI|STORE|DEP|META}-NNN` の形式で発行する
  - 新しい scope / PREFIX を追加する場合は本 GDR を `Superseded` にして新 GDR-META を発行する（直接編集禁止）
  - プロジェクト直下 `CLAUDE.md` に「コンテキスト短縮用キーワード」と出力先を反映する
- **再検討条件:**
  - YouTube Data API や外部サービスへの送信を導入する → `sec` scope / `SEC` PREFIX の追加検討
  - Firefox 等の他ブラウザ対応を行う → `EXT` の責務肥大化のため `EXT_CHROME` / `EXT_FF` 等への分割検討
  - Chrome Web Store への公開を行う → `prod` scope / `PUB` PREFIX（ストア審査・バージョニング）の追加検討
  - `META` PREFIX 内の GDR が 10 件を超える → 運用ルールの整理が必要なサイン
