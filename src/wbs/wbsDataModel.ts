/**
 * WBS (Work Breakdown Structure) Data Model
 * 
 * Obsidian Basesプラグインと連携し、フロントマタープロパティから
 * WBSデータを構築するためのインターフェース定義
 */

/**
 * タスクのステータス
 */
export type WBSStatus = 'not-started' | 'in-progress' | 'completed' | 'blocked' | 'cancelled';

/**
 * ステータスの表示名マッピング
 */
export const WBS_STATUS_LABELS: Record<WBSStatus, string> = {
	'not-started': '未着手',
	'in-progress': '進行中',
	'completed': '完了',
	'blocked': 'ブロック中',
	'cancelled': 'キャンセル'
};

/**
 * ステータスの色マッピング
 */
export const WBS_STATUS_COLORS: Record<WBSStatus, string> = {
	'not-started': '#808080',
	'in-progress': '#3498db',
	'completed': '#27ae60',
	'blocked': '#e74c3c',
	'cancelled': '#95a5a6'
};

/**
 * WBSアイテム（タスク）のインターフェース
 */
export interface WBSItem {
	/** ファイルパス（一意識別子） */
	id: string;
	
	/** タスク名（H1見出しまたはファイル名） */
	title: string;
	
	/** 親タスクのID（ルートの場合はnull） */
	parentId: string | null;
	
	/** 子タスクのID配列 */
	childIds: string[];
	
	/** WBS番号（例: "1.2.3"） */
	wbsNumber: string;
	
	/** ステータス */
	status: WBSStatus;
	
	/** 担当者 */
	assignee: string | null;
	
	/** 開始日 */
	startDate: string | null;
	
	/** 期限 */
	dueDate: string | null;
	
	/** 進捗率（0-100） */
	progress: number;
	
	/** 見積もり時間（時間単位） */
	estimatedHours: number | null;
	
	/** 実績時間（時間単位） */
	actualHours: number | null;
	
	/** 優先度（1-5、1が最高） */
	priority: number | null;
	
	/** タグ */
	tags: string[];
	
	/** 説明 */
	description: string | null;
	
	/** 階層レベル（ルートは0） */
	level: number;
	
	/** 展開状態 */
	isExpanded: boolean;
}

/**
 * WBSプロジェクトのインターフェース
 */
export interface WBSProject {
	/** プロジェクトID（フォルダパス） */
	id: string;
	
	/** プロジェクト名 */
	name: string;
	
	/** ルートアイテムのID配列 */
	rootItemIds: string[];
	
	/** 全アイテムのマップ */
	items: Map<string, WBSItem>;
	
	/** 最終更新日時 */
	lastUpdated: Date;
}

/**
 * フロントマターから読み取るプロパティ名のマッピング
 */
export interface WBSPropertyMapping {
	parent: string;
	status: string;
	assignee: string;
	startDate: string;
	dueDate: string;
	// Obsidian Full Calendar フィールド
	date: string;
	startTime: string;
	endTime: string;
	progress: string;
	estimatedHours: string;
	actualHours: string;
	priority: string;
	wbsNumber: string;
	/** チェックボックス型の完了フラグ (例: completed) */
	completed: string;
}

/**
 * デフォルトのプロパティマッピング
 */
export const DEFAULT_PROPERTY_MAPPING: WBSPropertyMapping = {
	parent: 'parent',
	status: 'status',
	assignee: 'assignee',
	startDate: 'start-date',
	dueDate: 'due-date',
	// Obsidian Full Calendar フィールド
	date: 'date',
	startTime: 'startTime',
	endTime: 'endTime',
	progress: 'progress',
	estimatedHours: 'estimated-hours',
	actualHours: 'actual-hours',
	priority: 'priority',
	wbsNumber: 'wbs-number',
	completed: 'completed'
};

/**
 * ステータス文字列を正規化する
 */
export function normalizeStatus(status: string | undefined): WBSStatus {
	if (!status) return 'not-started';
	
	const normalized = status.toLowerCase().trim();
	
	// 英語ステータス
	if (normalized === 'completed' || normalized === 'done' || normalized === 'complete') {
		return 'completed';
	}
	if (normalized === 'in-progress' || normalized === 'inprogress' || normalized === 'in progress' || normalized === 'doing') {
		return 'in-progress';
	}
	if (normalized === 'blocked' || normalized === 'hold' || normalized === 'on hold') {
		return 'blocked';
	}
	if (normalized === 'cancelled' || normalized === 'canceled') {
		return 'cancelled';
	}
	if (normalized === 'not-started' || normalized === 'todo' || normalized === 'to do' || normalized === 'not started') {
		return 'not-started';
	}
	
	// 日本語ステータス
	if (normalized === '完了' || normalized === '済' || normalized === '済み') {
		return 'completed';
	}
	if (normalized === '進行中' || normalized === '作業中' || normalized === '対応中') {
		return 'in-progress';
	}
	if (normalized === 'ブロック' || normalized === 'ブロック中' || normalized === '保留' || normalized === '待ち') {
		return 'blocked';
	}
	if (normalized === 'キャンセル' || normalized === '中止' || normalized === '取消') {
		return 'cancelled';
	}
	if (normalized === '未着手' || normalized === '未開始' || normalized === '予定') {
		return 'not-started';
	}
	
	return 'not-started';
}

/**
 * 期限を計算（date + endTime）
 * 
 * 優先順位:
 * 1. dueDate / due-date が設定されている場合（後方互換性）
 * 2. date + endTime が両方設定されている場合
 * 3. date のみ設定されている場合
 */
export function calculateDueDate(frontmatter: Record<string, unknown>, mapping: WBSPropertyMapping): string | null {
	// 後方互換性: 古い due-date プロパティをチェック
	const legacyDueDate = frontmatter[mapping.dueDate];
	if (legacyDueDate && typeof legacyDueDate === 'string') {
		return legacyDueDate;
	}

	// Obsidian Full Calendar 形式: date + endTime
	const date = frontmatter[mapping.date];
	const endTime = frontmatter[mapping.endTime];

	if (date && typeof date === 'string') {
		// endTime が設定されている場合、それを期限とする
		if (endTime && typeof endTime === 'string') {
			// endTime は HH:mm 形式（例: "18:30"）
			// date は YYYY-MM-DD 形式
			return date; // 日付のみを返す（時刻は無視）
		}
		// endTime がない場合でも date があれば期限として使用
		return date;
	}

	return null;
}

/**
 * 開始日を計算（date + startTime）
 * 
 * 優先順位:
 * 1. startDate / start-date が設定されている場合（後方互換性）
 * 2. date + startTime が両方設定されている場合
 * 3. date のみ設定されている場合
 */
export function calculateStartDate(frontmatter: Record<string, unknown>, mapping: WBSPropertyMapping): string | null {
	// 後方互換性: 古い start-date プロパティをチェック
	const legacyStartDate = frontmatter[mapping.startDate];
	if (legacyStartDate && typeof legacyStartDate === 'string') {
		return legacyStartDate;
	}

	// Obsidian Full Calendar 形式: date + startTime
	const date = frontmatter[mapping.date];
	const startTime = frontmatter[mapping.startTime];

	if (date && typeof date === 'string') {
		// startTime が設定されている場合、それから開始日を判定
		if (startTime && typeof startTime === 'string') {
			// startTime は HH:mm 形式（例: "09:00"）
			// date は YYYY-MM-DD 形式
			return date; // 日付のみを返す（時刻は無視）
		}
		// startTime がない場合でも date があれば開始日として使用
		return date;
	}

	return null;
}

/**
 * 進捗率を計算する（子タスクの進捗から）
 */
export function calculateProgress(item: WBSItem, items: Map<string, WBSItem>): number {
	// 子タスクがない場合は自身のステータスから進捗を判定
	if (item.childIds.length === 0) {
		if (item.progress > 0) {
			return item.progress;
		}
		switch (item.status) {
			case 'completed':
				return 100;
			case 'in-progress':
				return 50;
			case 'blocked':
				return item.progress || 0;
			case 'cancelled':
				return 0;
			default:
				return 0;
		}
	}
	
	// 子タスクの進捗率の平均を計算
	let totalProgress = 0;
	let childCount = 0;
	
	for (const childId of item.childIds) {
		const child = items.get(childId);
		if (child) {
			totalProgress += calculateProgress(child, items);
			childCount++;
		}
	}
	
	return childCount > 0 ? Math.round(totalProgress / childCount) : 0;
}

/**
 * WBS番号を生成する
 */
export function generateWBSNumber(item: WBSItem, items: Map<string, WBSItem>, siblingIndex: number): string {
	if (!item.parentId) {
		return String(siblingIndex + 1);
	}
	
	const parent = items.get(item.parentId);
	if (!parent) {
		return String(siblingIndex + 1);
	}
	
	return `${parent.wbsNumber}.${siblingIndex + 1}`;
}

/**
 * デフォルトのWBSアイテムを作成
 */
export function createDefaultWBSItem(id: string, title: string): WBSItem {
	return {
		id,
		title,
		parentId: null,
		childIds: [],
		wbsNumber: '',
		status: 'not-started',
		assignee: null,
		startDate: null,
		dueDate: null,
		progress: 0,
		estimatedHours: null,
		actualHours: null,
		priority: null,
		tags: [],
		description: null,
		level: 0,
		isExpanded: true
	};
}
