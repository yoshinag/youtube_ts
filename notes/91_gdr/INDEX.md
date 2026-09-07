# GDR_INDEX

> 全 GDR レコードの一覧。status: Proposed / Accepted / Implemented / Superseded / Rejected
> 前提定義: [00_CONTEXT_DEFINITIONS.md](00_CONTEXT_DEFINITIONS.md)

| ID | タイトル | scope | status | ファイル |
|---|---|---|---|---|
| GDR-META-001 | GDR 運用の scope と PREFIX を確定する | meta | Implemented | [gdr/00_GDR-META.md](gdr/00_GDR-META.md) |
| GDR-DOM-001 | タイムスタンプの一次ソースは実時刻 − 配信開始時刻とする | arch, spec, perf | Implemented | [gdr/01_GDR-DOM.md](gdr/01_GDR-DOM.md) |
| GDR-EXT-001 | WXT 3 エントリ構成・最小権限（`storage` のみ） | arch, pol | Implemented | [gdr/02_GDR-EXT.md](gdr/02_GDR-EXT.md) |
| GDR-STORE-001 | 記録の永続化スキーマ（v2: id / 重複排除 / 上限 5000 / JSON・テキスト書き出し） | data, spec | Implemented | [gdr/03_GDR-STORE.md](gdr/03_GDR-STORE.md) |
| GDR-UI-001 | popup はダークテーマを既定とする | ui | Implemented | [gdr/04_GDR-UI.md](gdr/04_GDR-UI.md) |
| GDR-UI-002 | offsetSec 設定と note 編集は popup 内でインライン（options ページなし） | ui, spec | Implemented | [gdr/04_GDR-UI.md](gdr/04_GDR-UI.md) |
| GDR-UI-003 | GUI 記録は popup の「記録」ボタン（ページ内注入なし・権限追加なし） | ui, arch | Implemented | [gdr/04_GDR-UI.md](gdr/04_GDR-UI.md) |
| GDR-STORE-002 | 配信メタを `local:streams` に別持ち、記録は videoId で紐づけ | data, spec | Implemented | [gdr/03_GDR-STORE.md](gdr/03_GDR-STORE.md) |
| GDR-UI-004 | popup は配信を親・記録を子のアコーディオン表示（フィルタ廃止） | ui | Implemented | [gdr/04_GDR-UI.md](gdr/04_GDR-UI.md) |
| GDR-DOM-002 | スキップ / フレーム取得は `<video>` 直接操作、経過秒は `seekable.end − currentTime` で再生位置に追従 | arch, spec | Implemented | [gdr/01_GDR-DOM.md](gdr/01_GDR-DOM.md) |
| GDR-EXT-002 | スクショは `downloads` 権限で `Downloads/ss/` に保存、`downloads.show` でフォルダを開く | arch, pol | Implemented | [gdr/02_GDR-EXT.md](gdr/02_GDR-EXT.md) |
