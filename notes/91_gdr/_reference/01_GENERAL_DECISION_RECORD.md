# 01. GDR（General Decision Record）とは

## 1. 概要

**GDR（General Decision Record）** とは、[ADR（Architectural Decision Record）](https://iroirotool.com/platform/ja/knowledge/hosyu_unyou/adr.html)の派生概念である。ADR がソフトウェアアーキテクチャに関する判断を記録する手段であるのに対し、GDR はアーキテクチャに限定せず、**仕様策定・UI 設計・運用方針・開発プロセス・ビジネス判断** を含む、プロジェクト内のあらゆる意思決定を対象としている。

厳密にいえば「General」が示す scope は **プロジェクトや業界によって異なる**。ソフトウェア開発では architecture / UI / policy が中心になるが、製造業であれば品質管理・サプライチェーン、医療分野であれば臨床手順・規制対応がスコープに加わりうる。GDR のフレームワーク自体は scope の具体的な定義に依存しない — scope テーブルを差し替えるだけで任意のドメインに適用できる。

## 2. 目的

ADR と同一:
1. **判断の根拠を残す** — なぜそう決めたかを将来の自分・チームメイトが追跡できる
2. **再検討を可能にする** — 状況が変わった時に、当時の前提を確認して判断を更新できる
3. **代替案を記録する** — 採用しなかった選択肢とその理由を残し、同じ議論の繰り返しを防ぐ

## 3. 書式

```markdown
**GDR-{PREFIX}-{番号}: {決定の要約}**

- **status:** {Proposed | Implemented | Superseded}
- **scope:** {scope の略記をカンマ区切り}
- **決定:** 何をするか（または何をしないか）
- **理由:** なぜその判断に至ったか（代替案との比較、トレードオフ）
- **影響:** この決定がもたらす具体的な影響
- **再検討条件:** どのような状況変化があれば判断を見直すか
```

- `{PREFIX}` はドメインを示す短い識別子
- `{番号}` は PREFIX 内の連番（3 桁ゼロ埋め: 001, 002, ...）
- `scope` は 1 つ以上。複数の場合はカンマ区切り（例: `arch, pol`）
- `status` は以下の 3 値:

| status | 意味 |
|---|---|
| `Proposed` | 提案中。レビュー・実装に着手していない |
| `Implemented` | 実装済み。コードや設定に反映された |
| `Superseded` | 代替済み。新しい GDR に置き換えられた |

`Superseded` にする場合は、代替先の GDR ID を記載し、代替先からも元の GDR へリンクを貼ること（例: `Superseded by GDR-UI-003` / `Supersedes GDR-UI-001`）

**二段保管の推奨:** Superseded 化した GDR は、`GDR_INDEX` に「GDR-OLD-NNN（要約） — Superseded by GDR-NEW-MMM → archived」の 1 行サマリを残したうえで、本文ファイルを `notes/_archive/91_gdr/gdr/` へ退避する運用を推奨する。AI は INDEX の 1 行で置換関係と再検討条件を把握でき、詳細議論本文は読まずに済むため、トークン消費が抑えられる。詳細は [02. AI-Driven GDR ビルドアップ §5.2](/01_GDR/02_AI_DRIVEN_GDR_BUILDUP.md#52-判断は積み上がるincremental-crystallization) を参照。

### 3.1. 任意フィールド

可視化（[06_VISUALIZATION_GUIDE.md](/01_GDR/guide/06_VISUALIZATION_GUIDE.md)）と DB 化（横断検索基盤への取り込み）を見据え、6 フィールドの**後**に以下の任意フィールドを追加できる（経緯: [008 提案](/91_demo_buildup_documents.md/kaizen/08_GDR可視化対応提案.md) GDR-META-025）:

```markdown
- **日時:** 2026-07-15T14:30:00+09:00
- **関連:** depends-on GDR-INFRA-002, derived-from §2-1
```

| フィールド | 形式 | 意味 |
|---|---|---|
| `日時` | ISO 8601 日付時刻・**タイムゾーンオフセット付き**（`YYYY-MM-DDTHH:MM:SS+09:00`）。時刻が不明な過去の判断は日付のみ（`YYYY-MM-DD`）も許容し、解釈は取り込み側で正規化する | 決定日時。同日に複数の判断が積み上がっても前後関係を保持する。status 遷移日時は追わない |
| `関連` | `{型} {対象}` のカンマ区切り。型は `depends-on`（前提依存）/ `refines`（親決定の細分化）/ `relates-to`（弱い関連）/ `derived-from`(由来) の**閉集合**、対象は GDR ID または文書内の `§{章}-{番号}` 参照 | GDR 間・課題間の型付きリンク。supersede 系は従来どおり status 行に記載する（関連には書かない） |

- 任意フィールドの**欠落は書式違反ではない**（lint 等で警告しない）。記録する価値がある場合にのみ書く
- 型の語彙の追加・改廃は GDR-META で行う

**あわせて定義する規約:**

- **主 scope:** `scope` の**先頭記載を主 scope** とみなす（可視化等で代表 scope が 1 つ必要な場面の規約。複数 scope の意味は従来どおり）
- **代替案の正式記法:** 理由フィールド配下のサブ箇条書き `- **代替案[ {ラベル}]:** {概要} → {評価}`。ラベル（A, B, ...）は複数案あるときのみ必須（1 件なら省略可）、却下した場合は末尾に「。却下」、部分採用・保留はその旨を記す

## 4. scope と PREFIX

GDR の書式（3 章）に登場する 2 つの分類軸を定義する。

### 4.1. scope — 決定の影響領域

scope は「この判断が何に影響するか」を示す分類である。GDR フレームワークは特定の scope セットを強制しない。プロジェクトや業界に合わせて定義する。

例: `arch`（アーキテクチャ）、`spec`（機能仕様）、`ui`（UI・UX）、`pol`（開発プロセス）、`prod`（プロダクト方針）、`perf`（パフォーマンス）、`meta`（GDR 運用）

1 つの GDR が複数の scope を持つことがある（例: `arch, pol`）。

業種別の scope 一覧 → [01_SCOPE_GUIDE.md](/01_GDR/guide/01_SCOPE_GUIDE.md)

### 4.2. PREFIX — ドメイン識別子

PREFIX は `GDR-{PREFIX}-{番号}` の形式で使われる、ドメインを示す短い識別子である。scope が「影響領域の分類」であるのに対し、PREFIX は「どのドメインの判断か」を一意に識別する。

例: `INFRA`（インフラ基盤）、`UI`（UI・UX）、`AD`（広告・収益化）、`META`（GDR 運用）

PREFIX と scope は同名になることがある（例: `GDR-UI-001` の `scope: ui`）。これは冗長ではなく、ドメイン識別と影響領域分類という異なる軸で記録されるため、両方を記述する。

業種別の PREFIX 一覧 → [02_PREFIX_GUIDE.md](/01_GDR/guide/02_PREFIX_GUIDE.md)

## 5. 関連文書

| # | 文書 | 内容 |
|---|---|---|
| 02 | [02_AI_DRIVEN_GDR_BUILDUP.md](/01_GDR/02_AI_DRIVEN_GDR_BUILDUP.md) | AI-Driven GDR ビルドアップ（定義 / サイクル / 原則） |
| G-00 | [00_GETTING_STARTED.md](/01_GDR/guide/00_GETTING_STARTED.md) | 最短導入ガイド（Getting Started） |
| G-01 | [01_SCOPE_GUIDE.md](/01_GDR/guide/01_SCOPE_GUIDE.md) | scope ガイドライン（共通 + 業種別） |
| G-02 | [02_PREFIX_GUIDE.md](/01_GDR/guide/02_PREFIX_GUIDE.md) | PREFIX ガイドライン（共通 + 業種別） |
| G-03 | [03_FIRST_PROMPT_GUIDE.md](/01_GDR/guide/03_FIRST_PROMPT_GUIDE.md) | ローカライズ初回プロンプトガイド |
| G-04 | [04_PROMPT_GUIDE.md](/01_GDR/guide/04_PROMPT_GUIDE.md) | プロンプトガイドライン（推奨プロンプト集） |
| G-05 | [05_CLAUDE_CODE_SETUP.md](/01_GDR/guide/05_CLAUDE_CODE_SETUP.md) | Claude Code セットアップ仕様（user-level config / スラッシュコマンド） |
| G-06 | [06_VISUALIZATION_GUIDE.md](/01_GDR/guide/06_VISUALIZATION_GUIDE.md) | 可視化ガイド（構造ビュー / 関係ビュー / `/gdr-map`） |
| T0 | [T0_FIRST_GDR_SAMPLE.md](/01_GDR/templates/T0_FIRST_GDR_SAMPLE.md) | 最初の GDR（`GDR-META-001`）の記述例 |
| T1 | [T1_CONTEXT_DEFINITIONS.md](/01_GDR/templates/T1_CONTEXT_DEFINITIONS.md) | Context Definitions テンプレート |
| T2 | [T2_BUILDUP_RECORD.md](/01_GDR/templates/T2_BUILDUP_RECORD.md) | ビルドアップ記録テンプレート |
