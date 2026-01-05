import {
	WBSItem,
	WBSProject,
	WBSStatus,
	WBS_STATUS_LABELS,
	WBS_STATUS_COLORS,
	calculateProgress
} from './wbsDataModel';

export type WBSColumn = 
	| 'wbs'
	| 'title'
	| 'status'
	| 'assignee'
	| 'startDate'
	| 'dueDate'
	| 'progress'
	| 'priority'
	| 'estimatedHours'
	| 'actualHours'
	| 'tags';

export interface WBSRenderOptions {
	columns?: WBSColumn[];
	showEmptyMessage?: string;
}

const DEFAULT_COLUMNS: WBSColumn[] = [
	'wbs',
	'title',
	'status',
	'assignee',
	'dueDate',
	'progress'
];

const COLUMN_LABELS: Record<WBSColumn, string> = {
	wbs: 'WBS',
	title: 'タスク名',
	status: 'ステータス',
	assignee: '担当者',
	startDate: '開始日',
	dueDate: '期限',
	progress: '進捗',
	priority: '優先度',
	estimatedHours: '見積時間',
	actualHours: '実績時間',
	tags: 'タグ'
};

export class WBSRenderer {
	private columns: WBSColumn[];
	private emptyMessage: string;

	constructor(options?: WBSRenderOptions) {
		this.columns = options?.columns || DEFAULT_COLUMNS;
		this.emptyMessage = options?.showEmptyMessage || 'タスクがありません';
	}

	/**
	 * WBSプロジェクトをHTMLテーブルとしてレンダリング
	 */
	renderTable(project: WBSProject): string {
		if (project.items.size === 0) {
			return this.renderEmptyState();
		}

		const visibleItems = this.getVisibleItems(project);
		const headerHtml = this.renderHeader();
		const rowsHtml = visibleItems
			.map(item => this.renderItem(item, project.items))
			.join('\n');

		return `
<div class="wbs-table-container">
	<table class="wbs-table">
		<thead>
			${headerHtml}
		</thead>
		<tbody>
			${rowsHtml}
		</tbody>
	</table>
</div>
		`.trim();
	}

	/**
	 * 空状態のレンダリング
	 */
	private renderEmptyState(): string {
		return `
<div class="wbs-empty">
	<div class="wbs-empty-icon">📋</div>
	<div class="wbs-empty-message">${this.emptyMessage}</div>
	<div class="wbs-empty-hint">フロントマターにparentプロパティを設定してタスクを階層化できます</div>
</div>
		`.trim();
	}

	/**
	 * テーブルヘッダーのレンダリング
	 */
	private renderHeader(): string {
		const cells = this.columns
			.map(col => `<th class="wbs-header-${col}">${COLUMN_LABELS[col]}</th>`)
			.join('\n\t\t\t');

		return `<tr>${cells}</tr>`;
	}

	/**
	 * 単一アイテムの行をレンダリング
	 */
	renderItem(item: WBSItem, allItems: Map<string, WBSItem>): string {
		const cells = this.columns
			.map(col => this.renderCell(item, col, allItems))
			.join('\n\t\t\t');

		const rowClasses = [
			'wbs-row',
			`level-${item.level}`,
			`status-row-${item.status}`
		].join(' ');

		return `<tr class="${rowClasses}" data-item-id="${item.id}">${cells}</tr>`;
	}

	/**
	 * セルのレンダリング
	 */
	private renderCell(item: WBSItem, column: WBSColumn, allItems: Map<string, WBSItem>): string {
		let content: string;

		switch (column) {
			case 'wbs':
				content = this.renderWBSNumber(item);
				break;
			case 'title':
				content = this.renderTitle(item);
				break;
			case 'status':
				content = this.renderStatus(item.status);
				break;
			case 'assignee':
				content = item.assignee || '-';
				break;
			case 'startDate':
				content = item.startDate || '-';
				break;
			case 'dueDate':
				content = this.renderDueDate(item);
				break;
			case 'progress':
				const progress = item.childIds.length > 0 
					? calculateProgress(item, allItems)
					: item.progress || (item.status === 'completed' ? 100 : item.status === 'in-progress' ? 50 : 0);
				content = this.renderProgressBar(progress);
				break;
			case 'priority':
				content = item.priority !== null ? this.renderPriority(item.priority) : '-';
				break;
			case 'estimatedHours':
				content = item.estimatedHours !== null ? `${item.estimatedHours}h` : '-';
				break;
			case 'actualHours':
				content = item.actualHours !== null ? `${item.actualHours}h` : '-';
				break;
			case 'tags':
				content = this.renderTags(item.tags);
				break;
			default:
				content = '-';
		}

		return `<td class="wbs-cell-${column}">${content}</td>`;
	}

	/**
	 * WBS番号のレンダリング（展開/折りたたみボタン付き）
	 */
	private renderWBSNumber(item: WBSItem): string {
		const hasChildren = item.childIds.length > 0;
		const indent = item.level * 1.5;

		if (hasChildren) {
			const icon = item.isExpanded ? '▼' : '▶';
			return `
<span style="padding-left: ${indent}em;">
	<button class="expand-btn" data-item-id="${item.id}" aria-label="${item.isExpanded ? '折りたたむ' : '展開する'}">
		${icon}
	</button>
	<span class="wbs-number">${item.wbsNumber}</span>
</span>
			`.trim();
		}

		return `
<span style="padding-left: ${indent}em;">
	<span class="wbs-number">${item.wbsNumber}</span>
</span>
		`.trim();
	}

	/**
	 * タイトルのレンダリング
	 */
	private renderTitle(item: WBSItem): string {
		return `
<a class="wbs-title-link" data-file-path="${item.id}" href="#">
	${this.escapeHtml(item.title)}
</a>
		`.trim();
	}

	/**
	 * ステータスのレンダリング
	 */
	private renderStatus(status: WBSStatus): string {
		const label = WBS_STATUS_LABELS[status];
		const color = WBS_STATUS_COLORS[status];

		return `
<span class="wbs-status status-${status}" style="--status-color: ${color};">
	${label}
</span>
		`.trim();
	}

	/**
	 * 期限のレンダリング（期限切れの場合は警告表示）
	 */
	private renderDueDate(item: WBSItem): string {
		if (!item.dueDate) {
			return '-';
		}

		const dueDate = new Date(item.dueDate);
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		dueDate.setHours(0, 0, 0, 0);

		const isOverdue = dueDate < today && item.status !== 'completed' && item.status !== 'cancelled';
		const isNearDue = !isOverdue && (dueDate.getTime() - today.getTime()) <= 3 * 24 * 60 * 60 * 1000;

		const className = isOverdue ? 'due-overdue' : isNearDue ? 'due-soon' : '';

		return `<span class="wbs-due-date ${className}">${item.dueDate}</span>`;
	}

	/**
	 * プログレスバーのレンダリング
	 */
	renderProgressBar(progress: number): string {
		const progressClass = this.getProgressClass(progress);

		return `
<div class="progress-bar-container">
	<div class="progress-bar ${progressClass}" style="width: ${progress}%;"></div>
	<span class="progress-text">${progress}%</span>
</div>
		`.trim();
	}

	/**
	 * 進捗に基づくCSSクラスを取得
	 */
	private getProgressClass(progress: number): string {
		if (progress >= 100) return 'progress-complete';
		if (progress >= 66) return 'progress-high';
		if (progress >= 33) return 'progress-medium';
		return 'progress-low';
	}

	/**
	 * 優先度のレンダリング
	 */
	private renderPriority(priority: number): string {
		const labels = ['', '最高', '高', '中', '低', '最低'];
		const colors = ['', '#e74c3c', '#e67e22', '#f1c40f', '#3498db', '#95a5a6'];
		
		const safeIndex = Math.max(1, Math.min(5, priority));
		const label = labels[safeIndex];
		const color = colors[safeIndex];

		return `<span class="wbs-priority priority-${safeIndex}" style="--priority-color: ${color};">${label}</span>`;
	}

	/**
	 * タグのレンダリング
	 */
	private renderTags(tags: string[]): string {
		if (tags.length === 0) return '-';

		const tagHtml = tags
			.map(tag => `<span class="wbs-tag">#${this.escapeHtml(tag)}</span>`)
			.join(' ');

		return `<span class="wbs-tags">${tagHtml}</span>`;
	}

	/**
	 * 表示するアイテムのリストを取得（展開状態を考慮）
	 */
	getVisibleItems(project: WBSProject): WBSItem[] {
		const result: WBSItem[] = [];

		const addItems = (itemIds: string[]): void => {
			for (const itemId of itemIds) {
				const item = project.items.get(itemId);
				if (item) {
					result.push(item);
					if (item.isExpanded && item.childIds.length > 0) {
						addItems(item.childIds);
					}
				}
			}
		};

		addItems(project.rootItemIds);
		return result;
	}

	/**
	 * HTMLエスケープ
	 */
	private escapeHtml(text: string): string {
		const escapeMap: Record<string, string> = {
			'&': '&amp;',
			'<': '&lt;',
			'>': '&gt;',
			'"': '&quot;',
			"'": '&#039;'
		};
		return text.replace(/[&<>"']/g, char => escapeMap[char]);
	}
}
