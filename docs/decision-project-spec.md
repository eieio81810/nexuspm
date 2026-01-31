# Decision Project 仕様書

## 概要
Decision Projectは、**比較検討・意思決定を伴うプロジェクト**を統合管理するnexuspmの機能です。
既存のWBS/Ganttによるタスク管理に加え、選択肢の評価、根拠の蓄積、意思決定ログ、リスク管理を同じリンク空間で扱います。

### 想定ユースケース
- 移住・引っ越し先の検討
- 転職・異動・進学の意思決定
- ツール/技術/ベンダー選定
- 高額購入（車/家/PC）の比較検討
- 投資案件・事業案件の評価
- 研究テーマ選定
- 旅行計画（候補地比較）

---

## データモデル（frontmatter契約）

### 共通プロパティ
すべてのDecision Project関連ノートは以下を持つ：

| プロパティ | 型 | 説明 |
|-----------|-----|------|
| `nexuspm-type` | string | `decision-project` / `option` / `decision` / `risk` / `assumption` / `evidence` / `task` |
| `parent` | wikilink | 親ノートへのリンク（WBS階層用） |
| `status` | string | 既存WBSステータス（正規化される） |

### decision-project（プロジェクト設定ノート）
フォルダ直下に1つ配置。評価軸やゲートを定義する。

```yaml
---
nexuspm-type: decision-project
criteria:
  - key: cost
    label: コスト
    weight: 3
    direction: lower-is-better
  - key: quality
    label: 品質
    weight: 5
    direction: higher-is-better
  - key: timeline
    label: 納期
    weight: 2
gates:
  - key: research
    label: 調査完了
  - key: shortlist
    label: 候補絞り込み
  - key: final
    label: 最終決定
---
# プロジェクト名
```

**発見ルール**
1. フォルダ内で `nexuspm-type: decision-project` を持つノートを探す
2. 複数見つかった場合は、ファイル名が `_project` で始まるものを優先
3. それでも複数あれば最初に見つかったものを使用
4. 見つからない場合はデフォルト設定（criteria空、scoring-missing: zero）を使用

### option（選択肢）
比較対象となる候補。

```yaml
---
nexuspm-type: option
parent: "[[プロジェクト名]]"
status: in-progress
scores:
  cost: 4
  quality: 3
  timeline: 5
constraints:
  - key: budget
    status: pass
  - key: location
    status: fail
    evidence: "[[調査メモ]]"
---
# 候補A
```

### decision（意思決定ログ）
何を、なぜ、どう決めたかを記録。

```yaml
---
nexuspm-type: decision
decision-status: decided
decision-date: 2024-03-15
options:
  - "[[候補A]]"
  - "[[候補B]]"
  - "[[候補C]]"
chosen: "[[候補A]]"
rationale: コストと品質のバランスが最も良い
---
# 決定：候補Aを採用
```

**decision-status**
- `proposed`: 提案中（未決）
- `decided`: 決定済み
- `superseded`: 別の決定で上書きされた

### risk（リスク）
不確実性とその対策。

```yaml
---
nexuspm-type: risk
parent: "[[プロジェクト名]]"
probability: 3
impact: 4
mitigation: "[[対策タスク]]"
owner: 田中
due-date: 2024-04-01
status: in-progress
---
# リスク：予算超過の可能性
```

**probability / impact**: 1-5（5が最高）
**exposure（自動計算）**: probability × impact

### assumption（前提・仮説）
意思決定の前提となる仮説と検証状況。

```yaml
---
nexuspm-type: assumption
assumption-status: testing
evidence:
  - "[[調査結果1]]"
  - "[[ヒアリングメモ]]"
---
# 仮説：市場は年5%成長する
```

**assumption-status**
- `untested`: 未検証
- `testing`: 検証中
- `validated`: 確証あり
- `falsified`: 反証された

### evidence（根拠・ソース）
意思決定の根拠となる一次情報。

```yaml
---
nexuspm-type: evidence
source-url: https://example.com/report
source-type: external-report
captured-at: 2024-03-10
---
# 市場調査レポート2024
```

---

## 集計仕様

### Option総合点（MCDA）
```
totalScore = Σ(weight_i × score_i)
```
- `score_i` が未入力の場合は **0** として扱う
- `direction: lower-is-better` の場合は `(maxScore - score_i)` に変換してから計算

### リスク露出（Exposure）
```
exposure = probability × impact
```
- 範囲外の値は 1-5 にクランプ
- 文字列の場合はパースを試み、失敗したら 1 をデフォルト

### WBS進捗
既存の `calculateProgress` をそのまま使用（子タスクの平均）

---

## UI: Decision View

### タブ構成
1. **Overview**: 進捗サマリ、未決Decision、上位リスク、次ゲート
2. **Options**: 候補一覧（総合点ランキング）、スコア詳細、根拠リンク
3. **Decisions**: 意思決定ログ一覧（状態別フィルタ）
4. **Risks**: リスクレジスタ（exposure降順）
5. **Timeline**: 既存WBS Gantt表示

### コマンド
- `Open Decision View`: Decision Viewを開く
- フォルダ右クリック → `Decision Projectとして開く`
- `.base`ファイル右クリック → `Decision Projectとして開く`（将来拡張）

---

## テストケース概要

### decisionProjectParser.test.ts
- nexuspm-typeによる分類が正しい
- decision-projectノートの発見ルールが機能する
- criteriaのパースが正しい（weight, direction含む）
- リンク抽出（`[[A]]`, `[[A|alias]]`）が機能する

### scoring.test.ts
- weight × score の合計が正しい
- 未入力スコアが0扱いされる
- direction: lower-is-better の変換が正しい
- 全criteria未入力で0点

### riskModel.test.ts
- exposure = probability × impact
- 範囲外の値がクランプされる
- exposure降順ソート

### decisionRenderer.test.ts
- Options一覧に必要列が出る（タイトル、総合点、各スコア）
- Decisions一覧に必要列が出る（タイトル、状態、選択肢、選択結果）
- Risks一覧に必要列が出る（タイトル、確率、影響、露出、対策）
