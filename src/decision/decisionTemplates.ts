/**
 * Decision Project テンプレート生成
 * 
 * 各ノートタイプのフロントマターテンプレートを生成する
 */

import type { DecisionItemType } from './decisionDataModel';

/**
 * テンプレート情報
 */
export interface TemplateInfo {
	/** ノートタイプ */
	type: DecisionItemType;
	/** 表示名 */
	label: string;
	/** アイコン */
	icon: string;
	/** デフォルトファイル名（拡張子なし） */
	defaultFileName: string;
	/** テンプレート内容 */
	content: string;
}

/**
 * 今日の日付をYYYY-MM-DD形式で取得
 */
function getTodayDate(): string {
	const today = new Date();
	const year = today.getFullYear();
	const month = String(today.getMonth() + 1).padStart(2, '0');
	const day = String(today.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/**
 * プロジェクト設定ノートのテンプレート
 */
export function getProjectTemplate(projectName: string = 'プロジェクト名'): string {
	return `---
nexuspm-type: decision-project
phase: collect
criteria: []
---
# ${projectName}

## 進め方ガイド

このプロジェクトは以下のフェーズで進めます。今は**情報収集フェーズ**です。

### フェーズ1: 情報収集（今ここ）

まずは判断材料を集めます。評価軸はまだ決めなくてOK。

- フォルダを右クリック → 「Decision: メモを作成」
- 思いついたこと、調べたこと、候補になりそうなものを自由に書く
- 十分に情報が集まったら次へ

### フェーズ2: 整理・評価軸の決定

集めた情報を見て、何を基準に決めるか考えます。

1. メモを見返して、重要な判断基準を洗い出す
2. このノートの \`criteria\` を編集（ソースモードで）
3. \`phase: organize\` に変更

\`\`\`yaml
criteria:
  - key: cost          # 一意のキー（英数字推奨）
    label: コスト       # 表示名
    weight: 4          # 重み（1〜5、大きいほど重要）
    direction: lower-is-better  # 方向性（下記参照）
  - key: quality
    label: 品質
    weight: 5
    # direction省略時は higher-is-better
\`\`\`

**directionについて:**
- \`higher-is-better\`（デフォルト）: スコアが高いほど良い（例: 品質、機能性）
- \`lower-is-better\`: スコアが低いほど良い（例: コスト、リスク、所要時間）

### フェーズ3: 選択肢の評価

評価軸が決まったら、選択肢をスコアリングします。

- メモを「選択肢」に昇格（nexuspm-typeを変更）
- 各選択肢で \`scores\` を入力
- 「Decision Projectとして開く」でランキング確認

### フェーズ4: 決定

- 「意思決定ログ」を作成して決定を記録
- \`phase: decided\` に変更

---

## プロジェクト概要

**何を決めるのか:**


**期限:**


**関係者:**


`;
}

/**
 * メモノートのテンプレート（情報収集フェーズ用）
 */
export function getMemoTemplate(memoName: string = 'メモ', projectLink: string = ''): string {
	const parentLine = projectLink ? `parent: "[[${projectLink}]]"` : 'parent: ""';
	const today = getTodayDate();
	return `---
nexuspm-type: memo
${parentLine}
created: ${today}
tags: []
---
# ${memoName}

## 内容

ここに自由にメモを書いてください。
- 調べたこと
- 思いついたアイデア
- 候補になりそうなもの
- 気になるリスク
- など

## このメモを後で使うには

情報が整理できたら、このメモを「昇格」させることができます。

1. 上のフロントマターをソースモードで開く
2. \`nexuspm-type\` を変更:
   - \`option\` → 選択肢として評価
   - \`risk\` → リスクとして管理
   - \`evidence\` → 根拠として保存
3. 必要に応じてプロパティを追加

`;
}

/**
 * 選択肢ノートのテンプレート
 */
export function getOptionTemplate(optionName: string = '選択肢名', projectLink: string = ''): string {
	const parentLine = projectLink ? `parent: "[[${projectLink}]]"` : 'parent: ""';
	return `---
nexuspm-type: option
${parentLine}
status: active
scores: {}
---
# ${optionName}

## 概要

この選択肢の概要を記載してください。

## 良い点

- 

## 悪い点

- 

## スコアについて

評価軸が決まったら、ソースモードで \`scores\` を編集してください。

\`\`\`yaml
scores:
  cost: 4
  quality: 3
\`\`\`

（keyはプロジェクト設定のcriteriaと一致させる、値は1〜5）

`;
}

/**
 * 意思決定ログのテンプレート
 */
export function getDecisionTemplate(decisionName: string = '意思決定タイトル', projectLink: string = ''): string {
	const parentLine = projectLink ? `parent: "[[${projectLink}]]"` : 'parent: ""';
	const today = getTodayDate();
	return `---
nexuspm-type: decision
${parentLine}
decision-status: proposed
decision-date: ${today}
chosen: ""
rationale: ""
---
# ${decisionName}

## 背景

この意思決定が必要になった背景を記載してください。

## 検討した選択肢

1. 
2. 

## 決定内容

（決定後に記載）

## 理由

（決定後に記載）

## 今後のアクション

- [ ] 
`;
}

/**
 * リスクノートのテンプレート
 */
export function getRiskTemplate(riskName: string = 'リスク名', projectLink: string = ''): string {
	const parentLine = projectLink ? `parent: "[[${projectLink}]]"` : 'parent: ""';
	return `---
nexuspm-type: risk
${parentLine}
status: active
probability: 3
impact: 3
owner: ""
---
# ${riskName}

## リスク概要

このリスクの概要を記載してください。

## 発生条件

どのような条件でこのリスクが顕在化するか。

## 影響

リスクが顕在化した場合の影響。

## 対策

- 

`;
}

/**
 * 仮説ノートのテンプレート
 */
export function getAssumptionTemplate(assumptionName: string = '仮説名', projectLink: string = ''): string {
	const parentLine = projectLink ? `parent: "[[${projectLink}]]"` : 'parent: ""';
	return `---
nexuspm-type: assumption
${parentLine}
assumption-status: untested
---
# ${assumptionName}

## 仮説

この仮説の内容を記載してください。

## 検証方法

この仮説をどのように検証するか。

## 検証結果

（検証後に記載）

`;
}

/**
 * エビデンスノートのテンプレート
 */
export function getEvidenceTemplate(evidenceName: string = 'エビデンス名', projectLink: string = ''): string {
	const parentLine = projectLink ? `parent: "[[${projectLink}]]"` : 'parent: ""';
	const today = getTodayDate();
	return `---
nexuspm-type: evidence
${parentLine}
source-url: ""
captured-at: ${today}
---
# ${evidenceName}

## 概要

このエビデンスの概要を記載してください。

## 内容

（引用や要約）

## 出典

- URL: 
- 取得日: ${today}

`;
}

/**
 * 利用可能なテンプレート一覧
 */
export const DECISION_TEMPLATES: TemplateInfo[] = [
	{
		type: 'decision-project',
		label: 'プロジェクト設定',
		icon: 'folder-cog',
		defaultFileName: '_project',
		content: '' // 動的生成
	},
	{
		type: 'memo',
		label: 'メモ',
		icon: 'sticky-note',
		defaultFileName: 'メモ',
		content: ''
	},
	{
		type: 'option',
		label: '選択肢',
		icon: 'list-checks',
		defaultFileName: '選択肢',
		content: ''
	},
	{
		type: 'decision',
		label: '意思決定ログ',
		icon: 'gavel',
		defaultFileName: '意思決定',
		content: ''
	},
	{
		type: 'risk',
		label: 'リスク',
		icon: 'alert-triangle',
		defaultFileName: 'リスク',
		content: ''
	},
	{
		type: 'assumption',
		label: '仮説',
		icon: 'lightbulb',
		defaultFileName: '仮説',
		content: ''
	},
	{
		type: 'evidence',
		label: 'エビデンス',
		icon: 'file-search',
		defaultFileName: 'エビデンス',
		content: ''
	}
];

/**
 * タイプに応じたテンプレートを取得
 */
export function getTemplateContent(type: DecisionItemType, name?: string, projectLink?: string): string {
	switch (type) {
		case 'decision-project':
			return getProjectTemplate(name);
		case 'memo':
			return getMemoTemplate(name, projectLink);
		case 'option':
			return getOptionTemplate(name, projectLink);
		case 'decision':
			return getDecisionTemplate(name, projectLink);
		case 'risk':
			return getRiskTemplate(name, projectLink);
		case 'assumption':
			return getAssumptionTemplate(name, projectLink);
		case 'evidence':
			return getEvidenceTemplate(name, projectLink);
		default:
			return '';
	}
}

/**
 * テンプレート情報を取得
 */
export function getTemplateInfo(type: DecisionItemType): TemplateInfo | undefined {
	return DECISION_TEMPLATES.find(t => t.type === type);
}
