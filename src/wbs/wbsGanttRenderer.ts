import {
	WBSItem,
	WBSProject,
	WBSStatus,
	WBS_STATUS_COLORS,
	calculateProgress
} from './wbsDataModel';

/**
 * ガントチャートの設定
 */
export interface GanttConfig {
	/** 1日あたりのピクセル幅 */
	dayWidth: number;
	/** 行の高さ */
	rowHeight: number;
	/** タスク名列の幅 */
	taskColumnWidth: number;
	/** WBS番号列の幅 */
	wbsColumnWidth: number;
}

const DEFAULT_CONFIG: GanttConfig = {
	dayWidth: 30,
	rowHeight: 36,
	taskColumnWidth: 250,
	wbsColumnWidth: 80
};

/**
 * 日付範囲
 */
interface DateRange {
	start: Date;
	end: Date;
	totalDays: number;
}

/**
 * WBSガントチャートレンダラー
 */
export class WBSGanttRenderer {
	private config: GanttConfig;

	constructor(config?: Partial<GanttConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	/**
	 * ガントチャートをHTMLとしてレンダリング
	 */
	render(project: WBSProject): string {
		// ルートアイテムの検証
		if (project.rootItemIds.length === 0) {
			return this.renderError('ルートタスクが見つかりません。parentプロパティが空のタスクが必要です。');
		}
		
		if (project.rootItemIds.length > 1) {
			const rootNames = project.rootItemIds
				.map(id => project.items.get(id)?.title || id)
				.join('、');
			return this.renderError(
				`ルートタスクは1つである必要があります。現在${project.rootItemIds.length}個のルートタスクがあります: ${rootNames}`,
				project.rootItemIds
			);
		}

		const dateRange = this.calculateDateRange(project);
		if (!dateRange) {
			return this.renderError('日付情報がありません。タスクに date と endTime を設定してください。');
		}

		const visibleItems = this.getVisibleItems(project);
		const timelineWidth = dateRange.totalDays * this.config.dayWidth;

		return `
<div class="wbs-gantt-container">
	<div class="wbs-gantt-wrapper">
		${this.renderFixedColumns(visibleItems, project)}
		<div class="wbs-gantt-scroll">
			<div class="wbs-gantt-timeline" style="width: ${timelineWidth}px;">
				${this.renderTimelineHeader(dateRange)}
				${this.renderTaskBars(visibleItems, project, dateRange)}
				${this.renderTodayLine(dateRange)}
			</div>
		</div>
	</div>
</div>
		`.trim();
	}

	/**
	 * エラー表示
	 */
	private renderError(message: string, errorFilePaths?: string[]): string {
		let fileLinksHtml = '';
		if (errorFilePaths && errorFilePaths.length > 0) {
			const links = errorFilePaths.map(filePath => {
				const fileName = filePath.split('/').pop()?.replace('.md', '') || filePath;
				return `<a class="wbs-error-file-link" data-file-path="${this.escapeHtml(filePath)}" href="#">📄 ${this.escapeHtml(fileName)}</a>`;
			}).join(' ');
			fileLinksHtml = `
	<div class="wbs-gantt-error-files">対象ファイル: ${links}</div>`;
		}
		
		return `
<div class="wbs-gantt-error">
	<div class="wbs-gantt-error-icon">⚠️</div>
	<div class="wbs-gantt-error-message">${this.escapeHtml(message)}</div>${fileLinksHtml}
</div>`.trim();
	}

	/**
	 * 固定カラム（WBS番号、タスク名）のレンダリング
	 */
	private renderFixedColumns(items: WBSItem[], project: WBSProject): string {
		const headerHeight = this.config.rowHeight * 2; // 月 + 日の2行
		const rows = items.map(item => this.renderTaskRow(item, project)).join('\n');

		return `
<div class="wbs-gantt-fixed">
	<div class="wbs-gantt-fixed-header" style="height: ${headerHeight}px;">
		<div class="wbs-gantt-col-wbs" style="width: ${this.config.wbsColumnWidth}px;">WBS</div>
		<div class="wbs-gantt-col-task" style="width: ${this.config.taskColumnWidth}px;">タスク名</div>
	</div>
	<div class="wbs-gantt-fixed-body">
		${rows}
	</div>
</div>
		`.trim();
	}

	/**
	 * タイトルから日付を抽出してトリムする（ガント用）
	 */
	private formatTitleForGantt(item: WBSItem): { text: string; tooltip?: string } {
		const full = item.title || '';
		let datePart: string | undefined;
		if (item.startDate) {
			datePart = item.startDate + (item.dueDate ? ` ~ ${item.dueDate}` : '');
		} else if (item.dueDate) {
			datePart = item.dueDate;
		} else {
			const m = full.match(/^(\d{4}[-\/\.]\d{2}[-\/\.]\d{2})\s*(.*)$/);
			if (m) {
				datePart = m[1];
				return { text: m[2] || full, tooltip: datePart };
			}
		}

		if (datePart) {
			const trimmed = full.replace(/^\s*(?:\d{4}[-\/\.]\d{2}[-\/\.]\d{2})\s*/,'').trim();
			return { text: trimmed || full, tooltip: datePart };
		}

		return { text: full };
	}

	/**
	 * タスク行（固定部分）のレンダリング
	 */
	private renderTaskRow(item: WBSItem, project: WBSProject): string {
		const indent = item.level * 16;
		const hasChildren = item.childIds.length > 0;
		const expandIcon = hasChildren ? (item.isExpanded ? '▼' : '▶') : '';
		const progress = calculateProgress(item, project.items);

		const { text, tooltip } = this.formatTitleForGantt(item);
		const titleAttr = tooltip ? ` title="${this.escapeHtml(String(tooltip))}"` : '';

		return `
<div class="wbs-gantt-row" style="height: ${this.config.rowHeight}px;" data-item-id="${item.id}">
	<div class="wbs-gantt-col-wbs" style="width: ${this.config.wbsColumnWidth}px;">
		${item.wbsNumber}
	</div>
	<div class="wbs-gantt-col-task" style="width: ${this.config.taskColumnWidth}px; padding-left: ${indent}px;">
		${hasChildren ? `<button class="expand-btn" data-item-id="${item.id}">${expandIcon}</button>` : ''}
		<a class="wbs-title-link" data-file-path="${item.id}" href="#"${titleAttr}>${this.escapeHtml(text)}</a>
		<span class="wbs-gantt-progress-text">${progress}%</span>
	</div>
</div>
		`.trim();
	}

	/**
	 * タイムラインヘッダーのレンダリング
	 */
	private renderTimelineHeader(dateRange: DateRange): string {
		const { start, totalDays } = dateRange;
		const months: { name: string; days: number; startOffset: number }[] = [];
		const days: { date: Date; dayOfWeek: number }[] = [];

		let currentDate = new Date(start);
		let currentMonth = -1;
		let monthStartOffset = 0;

		for (let i = 0; i < totalDays; i++) {
			const month = currentDate.getMonth();
			const year = currentDate.getFullYear();

			if (month !== currentMonth) {
				if (currentMonth !== -1) {
					months[months.length - 1].days = i - monthStartOffset;
				}
				months.push({
					name: `${year}/${month + 1}`,
					days: 0,
					startOffset: i
				});
				currentMonth = month;
				monthStartOffset = i;
			}

			days.push({
				date: new Date(currentDate),
				dayOfWeek: currentDate.getDay()
			});

			currentDate.setDate(currentDate.getDate() + 1);
		}

		// 最後の月の日数を設定
		if (months.length > 0) {
			months[months.length - 1].days = totalDays - monthStartOffset;
		}

		const monthHeaders = months.map(m => 
			`<div class="wbs-gantt-month" style="width: ${m.days * this.config.dayWidth}px;">${m.name}</div>`
		).join('');

		const dayHeaders = days.map((d, i) => {
			const isWeekend = d.dayOfWeek === 0 || d.dayOfWeek === 6;
			const dayNum = d.date.getDate();
			return `<div class="wbs-gantt-day${isWeekend ? ' weekend' : ''}" style="width: ${this.config.dayWidth}px;">${dayNum}</div>`;
		}).join('');

		return `
<div class="wbs-gantt-header">
	<div class="wbs-gantt-months" style="height: ${this.config.rowHeight}px;">
		${monthHeaders}
	</div>
	<div class="wbs-gantt-days" style="height: ${this.config.rowHeight}px;">
		${dayHeaders}
	</div>
</div>
		`.trim();
	}

	/**
	 * タスクバーのレンダリング
	 */
	private renderTaskBars(items: WBSItem[], project: WBSProject, dateRange: DateRange): string {
		const bars = items.map(item => this.renderTaskBar(item, project, dateRange)).join('\n');
		const gridLines = this.renderGridLines(dateRange, items.length);

		return `
<div class="wbs-gantt-bars">
	${gridLines}
	${bars}
</div>
		`.trim();
	}

	/**
	 * 単一タスクバーのレンダリング
	 */
	private renderTaskBar(item: WBSItem, project: WBSProject, dateRange: DateRange): string {
		const startDate = item.startDate ? new Date(item.startDate) : null;
		const endDate = item.dueDate ? new Date(item.dueDate) : null;

		// 日付がない場合は空行
		if (!startDate && !endDate) {
			return `<div class="wbs-gantt-bar-row" style="height: ${this.config.rowHeight}px;" data-item-id="${item.id}"></div>`;
		}

		const effectiveStart = startDate || endDate!;
		const effectiveEnd = endDate || startDate!;

		const startOffset = this.getDayOffset(dateRange.start, effectiveStart);
		const duration = this.getDaysBetween(effectiveStart, effectiveEnd) + 1;
		const progress = calculateProgress(item, project.items);
		const barColor = WBS_STATUS_COLORS[item.status];

		const left = startOffset * this.config.dayWidth;
		const width = duration * this.config.dayWidth;

		const hasChildren = item.childIds.length > 0;
		const barClass = hasChildren ? 'wbs-gantt-bar summary' : 'wbs-gantt-bar';

		return `
<div class="wbs-gantt-bar-row" style="height: ${this.config.rowHeight}px;" data-item-id="${item.id}">
	<div class="${barClass}" 
		 style="left: ${left}px; width: ${width}px; background-color: ${barColor}40; border-color: ${barColor};"
		 title="${this.escapeHtml(item.title)} (${item.startDate || '?'} ~ ${item.dueDate || '?'})">
		<div class="wbs-gantt-bar-progress" style="width: ${progress}%; background-color: ${barColor};"></div>
		${hasChildren ? this.renderSummaryMilestones(item, project, dateRange) : ''}
	</div>
</div>
		`.trim();
	}

	/**
	 * サマリータスクのマイルストーン表示
	 */
	private renderSummaryMilestones(item: WBSItem, project: WBSProject, dateRange: DateRange): string {
		// サマリータスクには開始/終了マーカーを表示
		return `<div class="wbs-gantt-bar-start"></div><div class="wbs-gantt-bar-end"></div>`;
	}

	/**
	 * グリッド線のレンダリング
	 */
	private renderGridLines(dateRange: DateRange, rowCount: number): string {
		const { start, totalDays } = dateRange;
		const lines: string[] = [];
		const totalHeight = rowCount * this.config.rowHeight;

		let currentDate = new Date(start);
		for (let i = 0; i < totalDays; i++) {
			const isWeekend = currentDate.getDay() === 0 || currentDate.getDay() === 6;
			const x = i * this.config.dayWidth;
			
			if (isWeekend) {
				lines.push(`<div class="wbs-gantt-grid-weekend" style="left: ${x}px; width: ${this.config.dayWidth}px; height: ${totalHeight}px;"></div>`);
			}
			
			currentDate.setDate(currentDate.getDate() + 1);
		}

		return `<div class="wbs-gantt-grid">${lines.join('')}</div>`;
	}

	/**
	 * 今日の線をレンダリング
	 */
	private renderTodayLine(dateRange: DateRange): string {
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		const offset = this.getDayOffset(dateRange.start, today);
		if (offset < 0 || offset > dateRange.totalDays) {
			return '';
		}

		const x = offset * this.config.dayWidth + this.config.dayWidth / 2;
		return `<div class="wbs-gantt-today" style="left: ${x}px;"></div>`;
	}

	/**
	 * 日付範囲を計算
	 */
	calculateDateRange(project: WBSProject): DateRange | null {
		let minDate: Date | null = null;
		let maxDate: Date | null = null;

		for (const item of project.items.values()) {
			if (item.startDate) {
				const start = new Date(item.startDate);
				if (!minDate || start < minDate) minDate = start;
				if (!maxDate || start > maxDate) maxDate = start;
			}
			if (item.dueDate) {
				const end = new Date(item.dueDate);
				if (!minDate || end < minDate) minDate = end;
				if (!maxDate || end > maxDate) maxDate = end;
			}
		}

		if (!minDate || !maxDate) {
			return null;
		}

		// 前後に余白を追加
		minDate.setDate(minDate.getDate() - 3);
		maxDate.setDate(maxDate.getDate() + 7);

		const totalDays = this.getDaysBetween(minDate, maxDate) + 1;

		return { start: minDate, end: maxDate, totalDays };
	}

	/**
	 * 2つの日付間の日数を計算
	 */
	private getDaysBetween(start: Date, end: Date): number {
		const startTime = new Date(start).setHours(0, 0, 0, 0);
		const endTime = new Date(end).setHours(0, 0, 0, 0);
		return Math.round((endTime - startTime) / (24 * 60 * 60 * 1000));
	}

	/**
	 * 開始日からのオフセット日数を取得
	 */
	private getDayOffset(rangeStart: Date, date: Date): number {
		return this.getDaysBetween(rangeStart, date);
	}

	/**
	 * 表示するアイテムのリストを取得
	 */
	private getVisibleItems(project: WBSProject): WBSItem[] {
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
