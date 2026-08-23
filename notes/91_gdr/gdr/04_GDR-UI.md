# GDR-UI

> popup / options / ページ内 UI に関する決定。

## GDR-UI-001: popup はダークテーマを既定とする

- **status:** Accepted
- **scope:** ui
- **決定:** popup は**ダークテーマのみ**を実装し、`color-scheme: dark` を宣言する。OS のライト設定には追従しない
- **理由:** YouTube のライブ視聴は暗いテーマで行われることが多く、popup が白く光ると視聴を妨げる（ユーザー指示 2026-08-24）。**代替案: `prefers-color-scheme` に追従** → 2 パレット分の保守が要り、現状の画面規模では見合わない。却下
- **影響:** popup の CSS をダーク配色に置き換える。配色トークンは `:root` の CSS 変数に集約し、将来ライト対応する場合の差し替え点を 1 箇所にする
- **再検討条件:** ライトテーマの要望が出た → `prefers-color-scheme` 追従または設定項目の追加を検討
- **日時:** 2026-08-24T00:00:00+09:00
- **関連:** relates-to GDR-EXT-001
- **出典:** [notes/20_kaizen/2026-08-24_storage_schema.md](../../20_kaizen/2026-08-24_storage_schema.md)
