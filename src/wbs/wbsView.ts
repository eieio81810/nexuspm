import { ItemView, WorkspaceLeaf, TFile, Menu, Notice, ViewStateResult } from 'obsidian';
import { WBSParser } from './wbsParser';
import { WBSRenderer, WBSColumn } from './wbsRenderer';
import { WBSGanttRenderer } from './wbsGanttRenderer';
import { WBSProject, WBSItem } from './wbsDataModel';
import { BaseFileParser, BaseConfig } from './baseFileParser';

export const WBS_VIEW_TYPE = 'wbs-view';

/**
 * ビューの状態（永続化用）
 */
interface WBSViewState {
	folder?: string;
	baseFile?: string;
	viewMode?: 'table' | 'gantt';
}

/**
 * ビューモード
 */
type ViewMode = 'table' | 'gantt';

export class WBSView extends ItemView {
	private parser: WBSParser;
	private tableRenderer: WBSRenderer;
	private ganttRenderer: WBSGanttRenderer;
	private baseParser: BaseFileParser;
	private currentProject: WBSProject | null = null;
	private currentFolder: string = '';
	private currentBaseFile: string | null = null;
	private currentBaseConfig: BaseConfig | null = null;
	private refreshDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	private isInitialized: boolean = false;
	private viewMode: ViewMode = 'gantt'; // デフォルトはガントチャート

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
		this.parser = new WBSParser(this.app.metadataCache, this.app.vault);
		this.tableRenderer = new WBSRenderer();
		this.ganttRenderer = new WBSGanttRenderer();
		this.baseParser = new BaseFileParser();
	}

	getViewType(): string {
		return WBS_VIEW_TYPE;
	}

	getDisplayText(): string {
		if (this.currentProject) {
			return `WBS: ${this.currentProject.name}`;
		}
		return 'WBS View';
	}

	getIcon(): string {
		return 'layout-list';
	}

	/**
	 * ビュー状態を取得（永続化用）
	 */
	getState(): WBSViewState {
		return {
			folder: this.currentFolder || undefined,
			baseFile: this.currentBaseFile || undefined,
			viewMode: this.viewMode
		};
	}

	/**
	 * ビュー状態を復元
	 */
	async setState(state: WBSViewState, result: ViewStateResult): Promise<void> {
		console.log('[WBS] setState called:', state);
		
		if (state.viewMode) {
			this.viewMode = state.viewMode;
		}
		
		if (state.baseFile) {
			await this.loadBaseFile(state.baseFile);
		} else if (state.folder) {
			await this.loadFolder(state.folder);
		}
		
		return super.setState(state, result);
	}

	async onOpen(): Promise<void> {
		console.log('[WBS] View opened');
		this.isInitialized = true;
		
		const container = this.contentEl;
		container.empty();
		container.addClass('wbs-view-container');
		
		if (!this.currentFolder && !this.currentBaseFile) {
			this.renderWelcome(container);
		}
	}

	async onClose(): Promise<void> {
		console.log('[WBS] View closed');
		if (this.refreshDebounceTimer) {
			clearTimeout(this.refreshDebounceTimer);
		}
	}

	/**
	 * ウェルカムメッセージをレンダリング
	 */
	private renderWelcome(container: HTMLElement): void {
		container.empty();
		container.innerHTML = `
<div class="wbs-welcome">
	<h2>📋 WBS ガントチャート</h2>
	<p>プロジェクトフォルダを選択してWBSガントチャートを表示します。</p>
	<div class="wbs-usage">
		<h3>使い方</h3>
		<ol>
			<li>フォルダを右クリック → 「WBSとして開く」</li>
			<li>各タスクファイルのフロントマターに<code>parent</code>プロパティを設定</li>
			<li><code>parent</code>が空のタスクがルート（最上位）になります</li>
		</ol>
		<h4>ルール:</h4>
		<ul>
			<li><code>parent</code>プロパティで親タスクを指定（例: <code>[[親タスク名]]</code>）</li>
			<li><code>parent</code>が空のタスクは<strong>1つのみ</strong>（ルートタスク）</li>
			<li>ガントチャートには<code>date</code>と<code>endTime</code>が必要</li>
		</ul>
		<h4>フロントマターの例（Obsidian Full Calendar）:</h4>
		<pre>---
parent: "[[プロジェクト名]]"
status: in-progress
date: 2024-03-19
startTime: 10:15
endTime: 11:45
assignee: 田中
progress: 50
tags:
  - アクティビティ
---</pre>
		<h4>ルートタスクの例（parentが空）:</h4>
		<pre>---
parent: ""
status: in-progress
date: 2024-01-01
endTime: 2024-12-31
---</pre>
		<h4>日付形式</h4>
		<ul>
			<li><code>date</code>: YYYY-MM-DD形式（必須）</li>
			<li><code>startTime</code>: HH:mm形式（開始時刻、オプション）</li>
			<li><code>endTime</code>: HH:mm形式（終了時刻、オプション）</li>
		</ul>
		<h4>後方互換性</h4>
		<p>古い形式も対応しています:</p>
		<pre>---
parent: "[[親タスク]]"
status: in-progress
start-date: 2024-01-01
due-date: 2024-01-31
---</pre>
	</div>
</div>
		`;
	}

	/**
	 * .baseファイルからWBSを読み込んで表示
	 */
	async loadBaseFile(baseFilePath: string): Promise<void> {
		console.log('[WBS] Loading base file:', baseFilePath);
		this.currentBaseFile = baseFilePath;
		this.currentFolder = '';
		
		const container = this.contentEl;
		container.empty();
		container.addClass('wbs-view-container');
		container.innerHTML = '<div class="wbs-loading">読み込み中...</div>';

		try {
			const baseFile = this.app.vault.getAbstractFileByPath(baseFilePath);
			if (!(baseFile instanceof TFile)) {
				throw new Error('.baseファイルが見つかりません');
			}

			const content = await this.app.vault.read(baseFile);
			this.currentBaseConfig = this.baseParser.parse(content);

			if (!this.currentBaseConfig) {
				throw new Error('.baseファイルのパースに失敗しました');
			}

			const sourceFolder = this.currentBaseConfig.source || 
				baseFilePath.substring(0, baseFilePath.lastIndexOf('/')) || '';

			const baseColumns = this.baseParser.getColumns(this.currentBaseConfig);
			const wbsColumns = this.baseParser.mapToWBSColumns(baseColumns) as WBSColumn[];
			this.tableRenderer = new WBSRenderer({ columns: wbsColumns });

			this.currentProject = await this.parser.parseFolder(sourceFolder);
			this.currentProject.name = baseFile.basename;
			
			this.render();
			this.app.workspace.requestSaveLayout();
		} catch (error) {
			console.error('[WBS] Load error:', error);
			container.innerHTML = `
<div class="wbs-error">
	<h3>エラー</h3>
	<p>${error instanceof Error ? error.message : 'Unknown error'}</p>
</div>
			`;
		}
	}

	/**
	 * 指定フォルダのWBSを読み込んで表示
	 */
	async loadFolder(folderPath: string): Promise<void> {
		console.log('[WBS] Loading folder:', folderPath);
		this.currentFolder = folderPath;
		this.currentBaseFile = null;
		this.currentBaseConfig = null;
		
		const container = this.contentEl;
		container.empty();
		container.addClass('wbs-view-container');
		container.innerHTML = '<div class="wbs-loading">読み込み中...</div>';

		try {
			this.tableRenderer = new WBSRenderer();
			
			this.currentProject = await this.parser.parseFolder(folderPath);
			console.log('[WBS] Parsed project:', this.currentProject.items.size, 'items');
			console.log('[WBS] Root items:', this.currentProject.rootItemIds.length);
			
			this.render();
			this.app.workspace.requestSaveLayout();
		} catch (error) {
			console.error('[WBS] Load error:', error);
			container.innerHTML = `
<div class="wbs-error">
	<h3>エラー</h3>
	<p>WBSの読み込みに失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}</p>
</div>
			`;
		}
	}

	/**
	 * WBSをレンダリング
	 */
	private render(): void {
		console.log('[WBS] Rendering in mode:', this.viewMode);
		if (!this.currentProject) {
			console.log('[WBS] No project to render');
			return;
		}

		const container = this.contentEl;
		container.empty();

		// ヘッダー部分
		const header = container.createDiv({ cls: 'wbs-header' });
		header.innerHTML = `
<div class="wbs-header-content">
	<h2 class="wbs-title">${this.currentProject.name}</h2>
	<div class="wbs-stats">
		<span class="wbs-stat">${this.currentProject.items.size} タスク</span>
		<span class="wbs-stat">${this.getCompletedCount()} 完了</span>
	</div>
</div>
<div class="wbs-actions">
	<div class="wbs-view-toggle">
		<button class="wbs-btn ${this.viewMode === 'gantt' ? 'active' : ''}" data-mode="gantt" aria-label="ガントチャート">📊</button>
		<button class="wbs-btn ${this.viewMode === 'table' ? 'active' : ''}" data-mode="table" aria-label="テーブル">📋</button>
	</div>
	<button class="wbs-btn wbs-btn-refresh" aria-label="更新">🔄</button>
	<button class="wbs-btn wbs-btn-expand-all" aria-label="すべて展開">↕</button>
	<button class="wbs-btn wbs-btn-copy-tags" aria-label="タグをコピー">🏷️</button>
</div>
		`;

		// ルート検証結果を表示
		const validation = this.parser.validateSingleRoot(this.currentProject);
		if (!validation.valid) {
			const errorDiv = container.createDiv({ cls: 'wbs-validation-error' });
			let errorHtml = `<span class="wbs-validation-icon">⚠️</span> ${validation.error}`;
			
			// エラー対象ファイルへのリンクを追加
			if (validation.errorFilePaths && validation.errorFilePaths.length > 0) {
				const fileLinks = validation.errorFilePaths.map(filePath => {
					const fileName = filePath.split('/').pop()?.replace('.md', '') || filePath;
					return `<a class="wbs-error-file-link" data-file-path="${filePath}" href="#">📄 ${fileName}</a>`;
				}).join(' ');
				errorHtml += `<div class="wbs-validation-error-files">対象ファイル: ${fileLinks}</div>`;
			}
			
			errorDiv.innerHTML = errorHtml;
		}

		// コンテンツ部分（テーブルまたはガントチャート）
		const contentContainer = container.createDiv({ cls: 'wbs-content' });
		
		if (this.viewMode === 'gantt') {
			contentContainer.innerHTML = this.ganttRenderer.render(this.currentProject);
		} else {
			contentContainer.innerHTML = this.tableRenderer.renderTable(this.currentProject);
		}

		// イベントリスナーを設定
		this.setupEventListeners(container);
		console.log('[WBS] Render complete');
	}

	/**
	 * 完了タスク数を取得
	 */
	private getCompletedCount(): number {
		if (!this.currentProject) return 0;
		let count = 0;
		for (const item of this.currentProject.items.values()) {
			if (item.status === 'completed') count++;
		}
		return count;
	}

	/**
	 * イベントリスナーを設定
	 */
	private setupEventListeners(container: HTMLElement): void {
		// ビューモード切替
		container.querySelectorAll('.wbs-view-toggle .wbs-btn').forEach(btn => {
			btn.addEventListener('click', (e) => {
				const mode = (e.currentTarget as HTMLElement).dataset.mode as ViewMode;
				if (mode && mode !== this.viewMode) {
					this.viewMode = mode;
					this.render();
					this.app.workspace.requestSaveLayout();
				}
			});
		});

		// 更新ボタン
		const refreshBtn = container.querySelector('.wbs-btn-refresh');
		refreshBtn?.addEventListener('click', () => this.refresh());

		// すべて展開/折りたたみボタン
		const expandAllBtn = container.querySelector('.wbs-btn-expand-all');
		expandAllBtn?.addEventListener('click', () => this.toggleExpandAll());

		// タグコピーボタン
		const copyTagsBtn = container.querySelector('.wbs-btn-copy-tags');
		copyTagsBtn?.addEventListener('click', () => this.showTagSuggestions());

		// 展開/折りたたみボタン
		container.querySelectorAll('.expand-btn').forEach(btn => {
			btn.addEventListener('click', (e) => {
				const itemId = (e.currentTarget as HTMLElement).dataset.itemId;
				if (itemId) this.toggleExpand(itemId);
			});
		});

		// タイトルリンク（ファイルを開く）
		container.querySelectorAll('.wbs-title-link').forEach(link => {
			link.addEventListener('click', (e) => {
				e.preventDefault();
				const filePath = (e.currentTarget as HTMLElement).dataset.filePath;
				if (filePath) this.openFile(filePath);
			});

			link.addEventListener('contextmenu', (e) => {
				e.preventDefault();
				const filePath = (e.currentTarget as HTMLElement).dataset.filePath;
				if (filePath) this.showContextMenu(e as MouseEvent, filePath);
			});
		});

		// エラーメッセージ内のファイルリンク（ファイルを開く）
		container.querySelectorAll('.wbs-error-file-link').forEach(link => {
			link.addEventListener('click', (e) => {
				e.preventDefault();
				const filePath = (e.currentTarget as HTMLElement).dataset.filePath;
				if (filePath) this.openFile(filePath);
			});
		});
	}

	/**
	 * WBS階層からタグ候補を生成して表示
	 */
	private showTagSuggestions(): void {
		if (!this.currentProject) {
			new Notice('プロジェクトが読み込まれていません');
			return;
		}

		const tags = this.generateWBSTags();
		
		if (tags.length === 0) {
			new Notice('タグ候補がありません');
			return;
		}

		const modal = new TagSuggestionModal(this.app, tags, this.currentProject.name);
		modal.open();
	}

	/**
	 * WBS階層からタグを生成
	 */
	generateWBSTags(): string[] {
		if (!this.currentProject) return [];

		const tags: string[] = [];
		const projectName = this.currentProject.name.replace(/\s+/g, '-');

		const generateTagsRecursive = (itemIds: string[], prefix: string): void => {
			for (const itemId of itemIds) {
				const item = this.currentProject!.items.get(itemId);
				if (!item) continue;

				const tagName = item.title.replace(/\s+/g, '-').replace(/[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF-]/g, '');
				const fullTag = prefix ? `${prefix}/${tagName}` : `${projectName}/${tagName}`;
				
				tags.push(fullTag);

				if (item.childIds.length > 0) {
					generateTagsRecursive(item.childIds, fullTag);
				}
			}
		};

		generateTagsRecursive(this.currentProject.rootItemIds, '');

		return tags;
	}

	private toggleExpand(itemId: string): void {
		if (!this.currentProject) return;

		const item = this.currentProject.items.get(itemId);
		if (item) {
			item.isExpanded = !item.isExpanded;
			this.render();
		}
	}

	private toggleExpandAll(): void {
		if (!this.currentProject) return;

		let hasCollapsed = false;
		for (const item of this.currentProject.items.values()) {
			if (item.childIds.length > 0 && !item.isExpanded) {
				hasCollapsed = true;
				break;
			}
		}

		for (const item of this.currentProject.items.values()) {
			if (item.childIds.length > 0) {
				item.isExpanded = hasCollapsed;
			}
		}

		this.render();
	}

	private async openFile(filePath: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (file instanceof TFile) {
			await this.app.workspace.getLeaf('tab').openFile(file);
		}
	}

	private showContextMenu(event: MouseEvent, filePath: string): void {
		const menu = new Menu();

		menu.addItem(item => {
			item.setTitle('ファイルを開く')
				.setIcon('file')
				.onClick(() => this.openFile(filePath));
		});

		menu.addItem(item => {
			item.setTitle('新しいタブで開く')
				.setIcon('file-plus')
				.onClick(async () => {
					const file = this.app.vault.getAbstractFileByPath(filePath);
					if (file instanceof TFile) {
						await this.app.workspace.getLeaf('tab').openFile(file);
					}
				});
		});

		menu.addSeparator();

		menu.addItem(item => {
			item.setTitle('WBSタグを追加')
				.setIcon('tag')
				.onClick(() => this.addWBSTagToFile(filePath));
		});

		menu.addSeparator();

		menu.addItem(item => {
			item.setTitle('完了にする')
				.setIcon('check')
				.onClick(() => this.setStatus(filePath, 'completed'));
		});

		menu.addItem(item => {
			item.setTitle('進行中にする')
				.setIcon('clock')
				.onClick(() => this.setStatus(filePath, 'in-progress'));
		});

		menu.showAtMouseEvent(event);
	}

	private async addWBSTagToFile(filePath: string): Promise<void> {
		if (!this.currentProject) return;

		const item = this.currentProject.items.get(filePath);
		if (!item) return;

		const tagPath = this.buildTagPath(item);
		
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) return;

		try {
			const content = await this.app.vault.read(file);
			const updatedContent = this.addTagToFrontmatter(content, tagPath);
			await this.app.vault.modify(file, updatedContent);
			new Notice(`タグ「${tagPath}」を追加しました`);
		} catch (error) {
			console.error('Tag add error:', error);
			new Notice('タグの追加に失敗しました');
		}
	}

	private buildTagPath(item: WBSItem): string {
		if (!this.currentProject) return '';

		const parts: string[] = [];
		let currentItem: WBSItem | undefined = item;

		while (currentItem) {
			parts.unshift(currentItem.title.replace(/\s+/g, '-'));
			if (currentItem.parentId) {
				currentItem = this.currentProject.items.get(currentItem.parentId);
			} else {
				break;
			}
		}

		const projectName = this.currentProject.name.replace(/\s+/g, '-');
		return `${projectName}/${parts.join('/')}`;
	}

	private addTagToFrontmatter(content: string, tag: string): string {
		const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
		const match = content.match(frontmatterRegex);

		if (match) {
			const frontmatter = match[1];
			const tagsRegex = /^tags:\s*\n((?:\s+-\s+.+\n)*)/m;
			const tagsMatch = frontmatter.match(tagsRegex);

			if (tagsMatch) {
				const existingTags = tagsMatch[1];
				if (!existingTags.includes(tag)) {
					const newTags = existingTags + `  - ${tag}\n`;
					const updatedFrontmatter = frontmatter.replace(tagsRegex, `tags:\n${newTags}`);
					return content.replace(frontmatterRegex, `---\n${updatedFrontmatter}\n---`);
				}
			} else {
				const updatedFrontmatter = frontmatter + `\ntags:\n  - ${tag}`;
				return content.replace(frontmatterRegex, `---\n${updatedFrontmatter}\n---`);
			}
		} else {
			return `---\ntags:\n  - ${tag}\n---\n\n${content}`;
		}

		return content;
	}

	private async setStatus(filePath: string, status: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) return;

		try {
			const content = await this.app.vault.read(file);
			const updatedContent = this.updateFrontmatter(content, 'status', status);
			await this.app.vault.modify(file, updatedContent);
			new Notice(`ステータスを「${status}」に変更しました`);
			this.scheduleRefresh();
		} catch (error) {
			console.error('Status update error:', error);
			new Notice('ステータスの変更に失敗しました');
		}
	}

	private updateFrontmatter(content: string, key: string, value: string): string {
		const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
		const match = content.match(frontmatterRegex);

		if (match) {
			const frontmatter = match[1];
			const keyRegex = new RegExp(`^${key}:.*$`, 'm');
			
			let updatedFrontmatter: string;
			if (keyRegex.test(frontmatter)) {
				updatedFrontmatter = frontmatter.replace(keyRegex, `${key}: ${value}`);
			} else {
				updatedFrontmatter = frontmatter + `\n${key}: ${value}`;
			}
			
			return content.replace(frontmatterRegex, `---\n${updatedFrontmatter}\n---`);
		} else {
			return `---\n${key}: ${value}\n---\n\n${content}`;
		}
	}

	private scheduleRefresh(): void {
		if (this.refreshDebounceTimer) {
			clearTimeout(this.refreshDebounceTimer);
		}
		this.refreshDebounceTimer = setTimeout(() => {
			this.refresh();
		}, 300);
	}

	async refresh(): Promise<void> {
		console.log('[WBS] Refreshing...');
		if (this.currentBaseFile) {
			await this.loadBaseFile(this.currentBaseFile);
		} else if (this.currentFolder) {
			await this.loadFolder(this.currentFolder);
		}
	}

	onFileChange(file: TFile): void {
		if (this.currentBaseFile && file.path === this.currentBaseFile) {
			this.scheduleRefresh();
			return;
		}
		
		if (this.currentFolder && file.path.startsWith(this.currentFolder)) {
			// If we have a loaded project, attempt incremental update to avoid full reload
			if (this.currentProject) {
				void (async () => {
					try {
						await this.parser.updateProjectWithFile(this.currentProject!, file, this.currentFolder);
						// Re-render view with updated project
						this.render();
					} catch (error) {
						console.error('[WBS] incremental update failed:', error);
						// Fallback to scheduled full refresh
						this.scheduleRefresh();
					}
				})();
				return;
			}
			this.scheduleRefresh();
		}
	}
}

/**
 * タグ候補を表示するモーダル
 */
import { App, Modal } from 'obsidian';

class TagSuggestionModal extends Modal {
	private tags: string[];
	private projectName: string;

	constructor(app: App, tags: string[], projectName: string) {
		super(app);
		this.tags = tags;
		this.projectName = projectName;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('wbs-tag-modal');

		contentEl.createEl('h2', { text: `📋 WBSタグ候補: ${this.projectName}` });
		contentEl.createEl('p', { 
			text: 'クリックでクリップボードにコピー、Obsidian Full Calendarなどで使用できます',
			cls: 'wbs-tag-modal-hint'
		});

		const listEl = contentEl.createEl('div', { cls: 'wbs-tag-list' });

		for (const tag of this.tags) {
			const tagEl = listEl.createEl('div', { cls: 'wbs-tag-item' });
			tagEl.createEl('span', { text: `#${tag}`, cls: 'wbs-tag-name' });
			
			const copyBtn = tagEl.createEl('button', { text: '📋', cls: 'wbs-tag-copy-btn' });
			copyBtn.addEventListener('click', async () => {
				await navigator.clipboard.writeText(tag);
				new Notice(`タグ「${tag}」をコピーしました`);
			});
		}

		const allCopyBtn = contentEl.createEl('button', { 
			text: 'すべてのタグをコピー',
			cls: 'wbs-tag-copy-all-btn'
		});
		allCopyBtn.addEventListener('click', async () => {
			const allTags = this.tags.map(t => `  - ${t}`).join('\n');
			await navigator.clipboard.writeText(`tags:\n${allTags}`);
			new Notice('すべてのタグをYAML形式でコピーしました');
		});
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
