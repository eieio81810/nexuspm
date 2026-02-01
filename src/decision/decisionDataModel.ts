/**
 * Decision Project Data Model
 * 
 * 意思決定を伴うプロジェクトのデータ構造定義
 * 選択肢の評価、根拠の蓄積、意思決定ログ、リスク管理を統合管理する
 */

/**
 * nexuspm-typeの種別
 */
export type DecisionItemType = 
	| 'decision-project'
	| 'memo'
	| 'option'
	| 'decision'
	| 'risk'
	| 'assumption'
	| 'evidence'
	| 'task';

/**
 * 評価軸の方向性
 */
export type CriterionDirection = 'higher-is-better' | 'lower-is-better';

/**
 * 評価軸の定義
 */
export interface Criterion {
	/** 一意キー（スコア参照用） */
	key: string;
	/** 表示ラベル */
	label: string;
	/** 重み（1以上推奨） */
	weight: number;
	/** 方向性（デフォルト: higher-is-better） */
	direction?: CriterionDirection;
	/** 説明 */
	description?: string;
}

/**
 * ゲート定義
 */
export interface Gate {
	/** 一意キー */
	key: string;
	/** 表示ラベル */
	label: string;
	/** 必須タグ（これを持つタスクが完了していること） */
	mustTags?: string[];
	/** 必須Decision（これが決定済みであること） */
	mustDecisions?: string[];
}

/**
 * プロジェクト設定
 */
export interface DecisionProjectConfig {
	/** 評価軸一覧 */
	criteria: Criterion[];
	/** ゲート定義（任意） */
	gates?: Gate[];
	/** 未入力スコアの扱い（現在は'zero'固定） */
	scoringMissing: 'zero';
}

/**
 * デフォルトのプロジェクト設定
 */
export const DEFAULT_PROJECT_CONFIG: DecisionProjectConfig = {
	criteria: [],
	gates: [],
	scoringMissing: 'zero'
};

/**
 * 制約条件のステータス
 */
export type ConstraintStatus = 'pass' | 'fail' | 'unknown';

/**
 * 制約条件
 */
export interface Constraint {
	/** 制約キー */
	key: string;
	/** 充足状況 */
	status: ConstraintStatus;
	/** 根拠リンク */
	evidence?: string;
}

/**
 * 選択肢（Option）
 */
export interface DecisionOption {
	/** ファイルパス（一意識別子） */
	id: string;
	/** タイトル（H1見出しまたはファイル名） */
	title: string;
	/** 親ノートID */
	parentId: string | null;
	/** ステータス */
	status: string;
	/** 評価スコア（criterionKey -> score） */
	scores: Record<string, number>;
	/** 制約条件 */
	constraints: Constraint[];
	/** 総合点（計算後に設定） */
	totalScore?: number;
	/** 順位（計算後に設定） */
	rank?: number;
}

/**
 * 意思決定のステータス
 */
export type DecisionStatus = 'proposed' | 'decided' | 'superseded';

/**
 * 意思決定ログ（Decision）
 */
export interface Decision {
	/** ファイルパス（一意識別子） */
	id: string;
	/** タイトル */
	title: string;
	/** 意思決定ステータス */
	decisionStatus: DecisionStatus;
	/** 決定日 */
	decisionDate: string | null;
	/** 選択肢リンク */
	options: string[];
	/** 選択結果リンク */
	chosen: string | null;
	/** 理由 */
	rationale: string | null;
	/** 親ノートID */
	parentId: string | null;
}

/**
 * リスク
 */
export interface Risk {
	/** ファイルパス（一意識別子） */
	id: string;
	/** タイトル */
	title: string;
	/** 親ノートID */
	parentId: string | null;
	/** ステータス */
	status: string;
	/** 発生確率（1-5） */
	probability: number;
	/** 影響度（1-5） */
	impact: number;
	/** リスク露出（probability × impact） */
	exposure: number;
	/** 対策（文字列またはタスクリンク） */
	mitigation: string | null;
	/** オーナー */
	owner: string | null;
	/** 期限 */
	dueDate: string | null;
}

/**
 * 仮説のステータス
 */
export type AssumptionStatus = 'untested' | 'testing' | 'validated' | 'falsified';

/**
 * 仮説（Assumption）
 */
export interface Assumption {
	/** ファイルパス（一意識別子） */
	id: string;
	/** タイトル */
	title: string;
	/** 親ノートID */
	parentId: string | null;
	/** 検証ステータス */
	assumptionStatus: AssumptionStatus;
	/** 根拠リンク */
	evidence: string[];
}

/**
 * 根拠（Evidence）
 */
export interface Evidence {
	/** ファイルパス（一意識別子） */
	id: string;
	/** タイトル */
	title: string;
	/** 親ノートID */
	parentId: string | null;
	/** ソースURL */
	sourceUrl: string | null;
	/** ソース種別 */
	sourceType: string | null;
	/** 取得日 */
	capturedAt: string | null;
}

/**
 * メモ（Memo）- 情報収集フェーズ用
 */
export interface Memo {
	/** ファイルパス（一意識別子） */
	id: string;
	/** タイトル */
	title: string;
	/** 親ノートID */
	parentId: string | null;
	/** タグ（分類用） */
	tags: string[];
	/** 昇格先タイプ（後で変換する場合） */
	promoteToType: DecisionItemType | null;
}

/**
 * Decision Project全体
 */
export interface DecisionProject {
	/** プロジェクトID（フォルダパス） */
	id: string;
	/** プロジェクト名 */
	name: string;
	/** プロジェクト設定 */
	config: DecisionProjectConfig;
	/** メモ（情報収集フェーズ） */
	memos: Map<string, Memo>;
	/** 選択肢 */
	options: Map<string, DecisionOption>;
	/** 意思決定ログ */
	decisions: Map<string, Decision>;
	/** リスク */
	risks: Map<string, Risk>;
	/** 仮説 */
	assumptions: Map<string, Assumption>;
	/** 根拠 */
	evidences: Map<string, Evidence>;
	/** 最終更新日時 */
	lastUpdated: Date;
}

/**
 * デフォルトのDecisionOptionを作成
 */
export function createDefaultOption(id: string, title: string): DecisionOption {
	return {
		id,
		title,
		parentId: null,
		status: 'not-started',
		scores: {},
		constraints: []
	};
}

/**
 * デフォルトのDecisionを作成
 */
export function createDefaultDecision(id: string, title: string): Decision {
	return {
		id,
		title,
		decisionStatus: 'proposed',
		decisionDate: null,
		options: [],
		chosen: null,
		rationale: null,
		parentId: null
	};
}

/**
 * デフォルトのRiskを作成
 */
export function createDefaultRisk(id: string, title: string): Risk {
	return {
		id,
		title,
		parentId: null,
		status: 'not-started',
		probability: 1,
		impact: 1,
		exposure: 1,
		mitigation: null,
		owner: null,
		dueDate: null
	};
}

/**
 * デフォルトのAssumptionを作成
 */
export function createDefaultAssumption(id: string, title: string): Assumption {
	return {
		id,
		title,
		parentId: null,
		assumptionStatus: 'untested',
		evidence: []
	};
}

/**
 * デフォルトのEvidenceを作成
 */
export function createDefaultEvidence(id: string, title: string): Evidence {
	return {
		id,
		title,
		parentId: null,
		sourceUrl: null,
		sourceType: null,
		capturedAt: null
	};
}

/**
 * デフォルトのMemoを作成
 */
export function createDefaultMemo(id: string, title: string): Memo {
	return {
		id,
		title,
		parentId: null,
		tags: [],
		promoteToType: null
	};
}

/**
 * 空のDecisionProjectを作成
 */
export function createEmptyProject(id: string, name: string): DecisionProject {
	return {
		id,
		name,
		config: { ...DEFAULT_PROJECT_CONFIG },
		memos: new Map(),
		options: new Map(),
		decisions: new Map(),
		risks: new Map(),
		assumptions: new Map(),
		evidences: new Map(),
		lastUpdated: new Date()
	};
}

/**
 * decision-statusを正規化
 */
export function normalizeDecisionStatus(status: string | undefined): DecisionStatus {
	if (!status) return 'proposed';
	const normalized = status.toLowerCase().trim();
	
	if (normalized === 'decided' || normalized === '決定' || normalized === '決定済み') {
		return 'decided';
	}
	if (normalized === 'superseded' || normalized === '上書き' || normalized === '破棄') {
		return 'superseded';
	}
	return 'proposed';
}

/**
 * assumption-statusを正規化
 */
export function normalizeAssumptionStatus(status: string | undefined): AssumptionStatus {
	if (!status) return 'untested';
	const normalized = status.toLowerCase().trim();
	
	if (normalized === 'testing' || normalized === '検証中') {
		return 'testing';
	}
	if (normalized === 'validated' || normalized === '確証' || normalized === '検証済み') {
		return 'validated';
	}
	if (normalized === 'falsified' || normalized === '反証' || normalized === '否定') {
		return 'falsified';
	}
	return 'untested';
}

/**
 * constraint-statusを正規化
 */
export function normalizeConstraintStatus(status: string | undefined): ConstraintStatus {
	if (!status) return 'unknown';
	const normalized = status.toLowerCase().trim();
	
	if (normalized === 'pass' || normalized === '充足' || normalized === 'ok' || normalized === 'true') {
		return 'pass';
	}
	if (normalized === 'fail' || normalized === '不充足' || normalized === 'ng' || normalized === 'false') {
		return 'fail';
	}
	return 'unknown';
}
