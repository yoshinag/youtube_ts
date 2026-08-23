# T0. 最初の GDR サンプル

> プロジェクトに GDR を導入する際の**最初の意思決定**（scope と PREFIX の確定）を、実際の GDR レコードとして記録した例。
> [02. AI-Driven GDR ビルドアップ § 7. 前提定義書](/01_GDR/02_AI_DRIVEN_GDR_BUILDUP.md#7-前提定義書context-definitions) で言及される「scope と PREFIX の選定自体が最初の GDR（`GDR-META-001`）になりうる」の具体例。

## 1. 使い方

1. プロジェクトの状況に合わせて、本ファイルの「サンプル GDR」セクションを書き換える
2. 書き換えた GDR を、自プロジェクトの GDR 出力先（推奨: `notes/91_gdr/gdr/00_GDR-META.md`。詳細は [03. ローカライズ初回プロンプトガイド §2.2](/01_GDR/guide/03_FIRST_PROMPT_GUIDE.md)）にコピーする
3. 同時に [T1_CONTEXT_DEFINITIONS.md](/01_GDR/templates/T1_CONTEXT_DEFINITIONS.md) を雛形に Context Definitions（前提定義書）を作成する
4. 以降のサイクルでこの GDR を「再検討条件」のチェックポイントとして参照する

T0 は**サンプル**であり、自プロジェクトに残す必要はない。最初の GDR を書く際の参考としてのみ利用する。

---

## 2. 想定プロジェクト（例）

| 項目 | 内容 |
|---|---|
| プロジェクト名 | TaskFlow |
| ドメイン | ソフトウェア（チーム向けタスク管理 SaaS） |
| 構成 | React + Node.js + PostgreSQL |
| 主な関心事 | API 設計、認証・認可、UI コンポーネント設計、デプロイ戦略 |

---

## 3. サンプル GDR

**GDR-META-001: GDR 運用の scope と PREFIX を確定する**

- **status:** Implemented
- **scope:** meta
- **決定:**
  - scope は `arch` / `spec` / `ui` / `pol` / `prod` / `perf` / `meta` / `sec` の 8 種を採用する
  - PREFIX は `INFRA` / `UI` / `API` / `SEC` / `CI` / `META` の 6 種を採用する
  - GDR 出力先は推奨標準（`notes/{01_spec,05_knowledge,10_things,20_kaizen,80_bug_fix_report,91_gdr,99_other}/`）に従う。GDR レコードは `notes/91_gdr/gdr/`、改善提案・ビルドアップ記録は `notes/20_kaizen/`、バグレポートは `notes/80_bug_fix_report/`
  - 略記の衝突を避けるため、業種横断 scope（`bill` / `ads` 等）と医療・金融由来の scope は**現時点では採用しない**
- **理由:**
  - チーム向け SaaS という性質上、API 設計（`spec`）と UI コンポーネント設計（`ui`）が判断の中心になる
  - 認証・認可は判断頻度が高く、`SEC` PREFIX で独立識別したほうが GDR_INDEX で見つけやすい
  - 代替案 A: 全業種 scope を取り込む → 学習コストが過大、使わない scope はノイズ。却下
  - 代替案 B: PREFIX を `APP` 一本に絞る → 検索性が落ち、GDR が混雑するため却下
  - 代替案 C: scope を `arch` のみに絞る（最小構成） → ADR 退化と同義になり、GDR の利点を失うため却下
- **影響:**
  - 以降の GDR は `GDR-{INFRA|UI|API|SEC|CI|META}-NNN` の形式で発行する
  - 新しい PREFIX を追加する場合は、本 GDR を `Superseded` にして新 GDR を発行する（直接編集は禁止）
  - チームメンバーの onboarding 時に、本 GDR と Context Definitions を最初に読ませる
  - CLAUDE.md の「コンテキスト短縮用キーワード」に `notes/20_kaizen/` と `notes/80_bug_fix_report/` のパスを反映する
- **再検討条件:**
  - モバイルアプリを追加する → `ui` scope の責務が肥大化するため、`ui_web` / `ui_mobile` への分割を検討
  - 課金機能を追加する → `BILL` PREFIX と `bill` scope の追加検討
  - 規制対応が必要になる（GDPR / SOC2 等） → `LEGAL` / `PRIV` PREFIX の追加検討
  - GDR 数が `META` PREFIX 内で 10 件を超える → 運用ルールの整理が必要なサイン

---

## 4. 補足: 業種別の最初の GDR

ソフトウェア以外のドメインで導入する場合、scope と PREFIX の選定は大きく変わる。

| ドメイン | 採用候補 scope | 採用候補 PREFIX |
|---|---|---|
| 医療・ヘルスケア | `arch` / `pol` / `meta` / `reg` / `priv` / `safe` | `INFRA` / `META` / `REG` / `PHI` / `CLIN` |
| 製造業 | `arch` / `pol` / `meta` / `qual` / `sup` / `comp` | `INFRA` / `META` / `QC` / `SCM` / `CERT` |
| EC・小売 | `arch` / `spec` / `ui` / `pol` / `meta` / `cat` / `chk` / `log` | `INFRA` / `META` / `UI` / `CART` / `CTLG` / `SHIP` |

詳細は [01. scope ガイド](/01_GDR/guide/01_SCOPE_GUIDE.md) と [02. PREFIX ガイド](/01_GDR/guide/02_PREFIX_GUIDE.md) を参照。
