/**
 * Decision View
 * 
 * Decision Projectを表示するObsidian ItemView
 */
import { ItemView, WorkspaceLeaf, TFile, Menu, Notice, ViewStateResult } from 'obsidian';
import { DecisionParser } from './decisionParser';
import { DecisionRenderer } from './decisionRenderer';
import { DecisionProject, DecisionOption } from './decisionDataModel';
import { rankOptions } from './scoring';
import { sortRisksByExposure } from './riskModel';

export const DECISION_VIEW_TYPE = 'decision-view';

/* eslint-disable obsidianmd/ui/sentence-case */

/**
 * ビューの状態（永続化用）
 */
interface DecisionViewState {
	folder?: string;
	activeTab?: TabType;
}

/**
 * タブの種類
 */
type TabType = 'overview' | 'options' | 'decisions' | 'risks';

export class DecisionView extends ItemView {
	private parser: DecisionParser;
	private renderer: DecisionRenderer;
	private currentProject: DecisionProject | null = null;
	private currentFolder: string = '';
	private activeTab: TabType = 'overview';
	private refreshDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	private isInitialized: boolean = false;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
		this.parser = new DecisionParser(this.app.metadataCache, this.app.vault);
		this.renderer = new DecisionRenderer();
	}

	getViewType(): string {
		return DECISION_VIEW_TYPE;
	}

	getDisplayText(): string {
		if (this.currentProject) {
			return `Decision: ${this.currentProject.name}`;
		}
		return 'Decision View';
	}

	getIcon(): string {
		return 'scale';
	}

	/**
	 * ビュー状態を取得（永続化用）
	 */
	getState(): Record<string, unknown> {
		return {
			folder: this.currentFolder || undefined,
			activeTab: this.activeTab
		};
	}

	/**
	 * ビュー状態を復元
	 */
	setState(state: Record<string, unknown>, result: ViewStateResult): Promise<void> {
		const s = state as DecisionViewState;
		console.debug('[Decision] setState called:', state);

		if (s.activeTab) {
			this.activeTab = s.activeTab;
		}

		const load = async (): Promise<void> => {
			if (s.folder) {
				await this.loadFolder(s.folder);
			}
		};

		return load().then(() => super.setState(state, result));
	}

	onOpen(): Promise<void> {
		console.debug('[Decision] View opened');
		this.isInitialized = true;

		const container = this.contentEl;
		container.empty();
		container.addClass('decision-view-container');

		if (!this.currentFolder) {
			this.renderWelcome(container);
		}
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		console.debug('[Decision] View closed');
		if (this.refreshDebounceTimer) {
			clearTimeout(this.refreshDebounceTimer);
		}
		return Promise.resolve();
	}

	/**
	 * ウェルカムメッセージをレンダリング
	 */
	private renderWelcome(container: HTMLElement): void {
		container.empty();
		container.appendChild(
			document.createRange().createContextualFragment(`
<div class="decision-welcome">
	<h2>Decision Project</h2>
	<p>意思決定を伴うプロジェクトを統合管理します。</p>
	<div class="decision-usage">
		<h3>使い方</h3>
		<ol>
			<li>フォルダを右クリック → 「Decision Projectとして開く」</li>
			<li>プロジェクト設定ノートを作成（<code>nexuspm-type: decision-project</code>）</li>
			<li>選択肢、リスク、意思決定ログをノートとして追加</li>
		</ol>
		<h4>ノートの種類:</h4>
		<ul>
			<li><code>nexuspm-type: option</code> - 選択肢（候補）</li>
			<li><code>nexuspm-type: decision</code> - 意思決定ログ</li>
			<li><code>nexuspm-type: risk</code> - リスク</li>
			<li><code>nexuspm-type: assumption</code> - 仮説・前提</li>
			<li><code>nexuspm-type: evidence</code> - 根拠・エビデンス</li>
		</ul>
		<h4>プロジェクト設定ノートの例:</h4>
		<pre>---
nexuspm-type: decision-project
criteria:
  - key: cost
    label: コスト
    weight: 3
    direction: lower-is-better
  - key: quality
    label: 品質
    weight: 5
---
# プロジェクト名</pre>
		<h4>選択肢ノートの例:</h4>
		<pre>---
nexuspm-type: option
parent: "[[プロジェクト名]]"
scores:
  cost: 4
  quality: 3
---
# 候補A</pre>
	</div>
</div>
			`)
		);
	}

	/**
	 * 指定フォルダのDecision Projectを読み込んで表示
	 */
	loadFolder(folderPath: string): Promise<void> {
		console.debug('[Decision] Loading folder:', folderPath);
		this.currentFolder = folderPath;

		const container = this.contentEl;
		container.empty();
		container.addClass('decision-view-container');
		container.createDiv({ cls: 'decision-loading', text: '読み込み中...' });

		try {
			this.currentProject = this.parser.parseFolder(folderPath);
			console.debug('[Decision] Parsed project:', {
				options: this.currentProject.options.size,
				decisions: this.currentProject.decisions.size,
				risks: this.currentProject.risks.size
			});

			// スコアを計算してランキング
			if (this.currentProject.options.size > 0 && this.currentProject.config.criteria.length > 0) {
				const ranked = rankOptions(this.currentProject.options, this.currentProject.config.criteria);
				for (const option of ranked) {
					this.currentProject.options.set(option.id, option);
				}
			}

			this.render();
			this.app.workspace.requestSaveLayout();
		} catch (error) {
			console.error('[Decision] Load error:', error);
			container.empty();
			const errorEl = container.createDiv({ cls: 'decision-error' });
			errorEl.createEl('h3', { text: 'エラー' });
			errorEl.createEl('p', { text: error instanceof Error ? error.message : '不明なエラー' });
		}
		return Promise.resolve();
	}

	/**
	 * ビューをレンダリング
	 */
	private render(): void {
		console.debug('[Decision] Rendering tab:', this.activeTab);
		if (!this.currentProject) {
			console.debug('[Decision] No project to render');
			return;
		}

		const container = this.contentEl;
		container.empty();

		// ヘッダー
		const header = container.createDiv({ cls: 'decision-header' });
		const headerContent = header.createDiv({ cls: 'decision-header-content' });
		headerContent.createEl('h2', { cls: 'decision-title', text: this.currentProject.name });

		const stats = headerContent.createDiv({ cls: 'decision-stats' });
		stats.createEl('span', { cls: 'decision-stat', text: `${this.currentProject.options.size} 選択肢` });
		stats.createEl('span', { cls: 'decision-stat', text: `${this.currentProject.decisions.size} 意思決定` });
		stats.createEl('span', { cls: 'decision-stat', text: `${this.currentProject.risks.size} リスク` });

		// アクション
		const actions = header.createDiv({ cls: 'decision-actions' });
		actions.createEl('button', { cls: 'decision-btn decision-btn-refresh', attr: { 'aria-label': '更新' }, text: '🔄' });

		// タブ
		const tabs = container.createDiv({ cls: 'decision-tabs' });
		const tabItems: { key: TabType; label: string }[] = [
			{ key: 'overview', label: '概要' },
			{ key: 'options', label: '選択肢' },
			{ key: 'decisions', label: '意思決定' },
			{ key: 'risks', label: 'リスク' }
		];

		for (const tab of tabItems) {
			const tabEl = tabs.createEl('button', {
				cls: `decision-tab ${this.activeTab === tab.key ? 'active' : ''}`,
				text: tab.label,
				attr: { 'data-tab': tab.key }
			});
			void tabEl;
		}

		// コンテンツ
		const content = container.createDiv({ cls: 'decision-content' });
		this.renderTabContent(content);

		// イベントリスナー
		this.setupEventListeners(container);
		console.debug('[Decision] Render complete');
	}

	/**
	 * タブコンテンツをレンダリング
	 */
	private renderTabContent(container: HTMLElement): void {
		if (!this.currentProject) return;

		switch (this.activeTab) {
			case 'overview':
				container.appendChild(
					document.createRange().createContextualFragment(
						this.renderer.renderOverview(this.currentProject)
					)
				);
				break;

			case 'options': {
				const options = Array.from(this.currentProject.options.values());
				container.appendChild(
					document.createRange().createContextualFragment(
						this.renderer.renderOptionsTable(options, this.currentProject.config.criteria)
					)
				);
				break;
			}

			case 'decisions': {
				const decisions = Array.from(this.currentProject.decisions.values());
				container.appendChild(
					document.createRange().createContextualFragment(
						this.renderer.renderDecisionsTable(decisions)
					)
				);
				break;
			}

			case 'risks': {
				const risks = sortRisksByExposure(this.currentProject.risks);
				container.appendChild(
					document.createRange().createContextualFragment(
						this.renderer.renderRisksTable(risks)
					)
				);
				break;
			}
		}
	}

	/**
	 * イベントリスナーを設定
	 */
	private setupEventListeners(container: HTMLElement): void {
		// タブ切り替え
		container.querySelectorAll('.decision-tab').forEach(tab => {
			tab.addEventListener('click', (e) => {
				const tabKey = (e.currentTarget as HTMLElement).dataset.tab as TabType;
				if (tabKey && tabKey !== this.activeTab) {
					this.activeTab = tabKey;
					this.render();
					this.app.workspace.requestSaveLayout();
				}
			});
		});

		// 更新ボタン
		const refreshBtn = container.querySelector('.decision-btn-refresh');
		refreshBtn?.addEventListener('click', () => void this.refresh());

		// タイトルリンク（ファイルを開く）
		container.querySelectorAll('.decision-title-link').forEach(link => {
			link.addEventListener('click', (e) => {
				e.preventDefault();
				const filePath = (e.currentTarget as HTMLElement).dataset.filePath;
				if (filePath) void this.openFile(filePath);
			});

			link.addEventListener('contextmenu', (e) => {
				e.preventDefault();
				const filePath = (e.currentTarget as HTMLElement).dataset.filePath;
				if (filePath) this.showContextMenu(e as MouseEvent, filePath);
			});
		});
	}

	/**
	 * リロード
	 */
	async refresh(): Promise<void> {
		if (this.currentFolder) {
			await this.loadFolder(this.currentFolder);
		}
	}

	/**
	 * ファイル変更時のコールバック
	 */
	onFileChange(file: TFile): void {
		void file;
		if (!this.isInitialized) return;
		if (this.refreshDebounceTimer) {
			clearTimeout(this.refreshDebounceTimer);
		}
		this.refreshDebounceTimer = setTimeout(() => {
			void this.refresh();
		}, 250);
	}

	/**
	 * ファイルを開く
	 */
	private async openFile(filePath: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) return;

		const targetLeaf = this.app.workspace.getLeaf('split', 'vertical');
		await targetLeaf.openFile(file);
	}

	/**
	 * コンテキストメニューを表示
	 */
	private showContextMenu(event: MouseEvent, filePath: string): void {
		const menu = new Menu();

		menu.addItem(item => {
			item.setTitle('ファイルを開く')
				.setIcon('file')
				.onClick(() => void this.openFile(filePath));
		});

		menu.addItem(item => {
			item.setTitle('新しいペインで開く')
				.setIcon('file-plus')
				.onClick(() => {
					void (async () => {
						const file = this.app.vault.getAbstractFileByPath(filePath);
						if (!(file instanceof TFile)) return;
						const newLeaf = this.app.workspace.getLeaf('split', 'vertical');
						await newLeaf.openFile(file);
					})().catch((err) => console.error('[Decision] 新しいペインでファイルを開けませんでした', err));
				});
		});

		menu.showAtMouseEvent(event);
	}
}
