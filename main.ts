/* eslint-disable obsidianmd/ui/sentence-case */

import { App, Plugin, PluginSettingTab, Setting, Notice, TFile, TFolder, WorkspaceLeaf, Menu, MenuItem, TAbstractFile } from 'obsidian';
import { GraphLabelManager } from './src/graphLabelManager.js';
import { WBSView, WBS_VIEW_TYPE } from './src/wbs/wbsView.js';
import { DecisionView, DECISION_VIEW_TYPE } from './src/decision/decisionView.js';
import { DECISION_TEMPLATES, getTemplateContent } from './src/decision/decisionTemplates.js';
import type { DecisionItemType } from './src/decision/decisionDataModel.js';
import { ProjectConfigManager, ProjectType } from './src/projectConfig.js';
import { AIAgentView, AI_AGENT_VIEW_TYPE, activateAIAgentView } from './src/ai/aiAgentView.js';
import { AIAgentSettings, DEFAULT_AI_AGENT_SETTINGS, LLMProvider } from './src/ai/aiAgentDataModel.js';

interface HadocommunPluginSettings {
	greeting: string;
	useH1ForGraphNodes: boolean;
	wbsEnabled: boolean;
	decisionEnabled: boolean;
	aiAgentEnabled: boolean;
	aiAgentSettings: AIAgentSettings;
}

interface GraphRenderer {
	px?: { stage?: unknown };
	nodes?: unknown[];
	nodeLookup?: Record<string, unknown>;
	scale?: number;
	panX?: number;
	panY?: number;
	nodeScale?: number;
}

interface GraphNode {
	id?: string;
	path?: string;
	text?: {
		text?: string;
		alpha?: number;
		updateText?: (force: boolean) => void;
		dirty?: boolean;
	};
	x?: number;
	y?: number;
	fontDirty?: boolean;
}

interface RenderableNode {
	id: string;
	textNode: GraphNode['text'];
	rawNode: GraphNode;
}

const DEFAULT_SETTINGS: HadocommunPluginSettings = {
	greeting: 'ハドこみゅへようこそ！ 🌈',
	useH1ForGraphNodes: false,
	wbsEnabled: true,
	decisionEnabled: true,
	aiAgentEnabled: true,
	aiAgentSettings: DEFAULT_AI_AGENT_SETTINGS
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === 'object';

export default class HadocommunPlugin extends Plugin {
	settings: HadocommunPluginSettings;
	private currentRenderer: GraphRenderer | null = null;
	private labelInterval: number | null = null;
	private originalLabels: Map<string, string> = new Map();
	public overlayLabels: Map<string, unknown> = new Map();
	private labelManager: GraphLabelManager;
	private projectConfigManager: ProjectConfigManager;

	async onload() {
		await this.loadSettings();

		(window as { hadocommunPlugin?: HadocommunPlugin }).hadocommunPlugin = this;

		this.labelManager = new GraphLabelManager(this.app.metadataCache, this.app.vault);
		this.projectConfigManager = new ProjectConfigManager(this.app);

		// WBS View を登録
		this.registerView(
			WBS_VIEW_TYPE,
			(leaf) => new WBSView(leaf)
		);

		// Decision View を登録
		this.registerView(
			DECISION_VIEW_TYPE,
			(leaf) => new DecisionView(leaf)
		);

		// AI Agent View を登録
		this.registerView(
			AI_AGENT_VIEW_TYPE,
			(leaf) => new AIAgentView(leaf, this.settings.aiAgentSettings)
		);

		const ribbonIconEl = this.addRibbonIcon('dice', 'Hadocommun', (evt: MouseEvent) => {
			void evt;
			new Notice(this.settings.greeting);
		});
		ribbonIconEl.addClass('hadocommun-ribbon-class');

		// WBS リボンアイコンを追加
		if (this.settings.wbsEnabled) {
			const wbsRibbonEl = this.addRibbonIcon('layout-list', 'WBSビューを開く', () => {
				void this.activateWBSView().catch((err) => console.error('[Hadocommun] WBSビューの起動に失敗しました', err));
			});
			wbsRibbonEl.addClass('wbs-ribbon-class');
		}

		// Decision リボンアイコンを追加
		if (this.settings.decisionEnabled) {
			const decisionRibbonEl = this.addRibbonIcon('scale', 'Decision Viewを開く', () => {
				void this.activateDecisionView().catch((err: Error) => console.error('[Hadocommun] Decision Viewの起動に失敗しました', err));
			});
			decisionRibbonEl.addClass('decision-ribbon-class');
		}

		// AI Agent リボンアイコンを追加
		if (this.settings.aiAgentEnabled) {
			const aiRibbonEl = this.addRibbonIcon('bot', 'AI Agentを開く', () => {
				void this.activateAIAgentView().catch((err: Error) => console.error('[Hadocommun] AI Agentの起動に失敗しました', err));
			});
			aiRibbonEl.addClass('ai-agent-ribbon-class');
		}

		this.addCommand({
			id: 'show-greeting',
			name: '挨拶メッセージを表示',
			callback: () => {
				new Notice(this.settings.greeting);
			}
		});

		// WBS コマンドを追加
		this.addCommand({
			id: 'open-wbs-view',
			name: 'WBSビューを開く',
			callback: () => {
				void this.activateWBSView().catch((err) => console.error('[Hadocommun] WBSビューの起動に失敗しました', err));
			}
		});

		this.addCommand({
			id: 'open-folder-as-wbs',
			name: '現在のフォルダをWBSとして開く',
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile) {
					if (!checking) {
						const folderPath = activeFile.parent?.path || '';
						void this.openFolderAsWBS(folderPath).catch((err) => console.error('[Hadocommun] フォルダをWBSとして開けませんでした', err));
					}
					return true;
				}
				return false;
			}
		});

		// WBSタグをコピーするコマンド
		this.addCommand({
			id: 'copy-wbs-tags',
			name: 'WBSタグをクリップボードにコピー',
			checkCallback: (checking: boolean) => {
				const leaves = this.app.workspace.getLeavesOfType(WBS_VIEW_TYPE);
				if (leaves.length > 0) {
					if (!checking) {
						const view = leaves[0].view as WBSView;
						if (view && typeof view.generateWBSTags === 'function') {
							const tags = view.generateWBSTags();
							if (tags.length > 0) {
								const yamlTags = tags.map((t: string) => `  - ${t}`).join('\n');
								void navigator.clipboard
									.writeText(`tags:\n${yamlTags}`)
									.then(() => new Notice('WBSタグをクリップボードにコピーしました'))
									.catch((err) => console.error('[Hadocommun] WBSタグのコピーに失敗しました', err));
							}
						}
					}
					return true;
				}
				return false;
			}
		});

		// Decision コマンドを追加
		this.addCommand({
			id: 'open-decision-view',
			name: 'Decision Viewを開く',
			callback: () => {
				void this.activateDecisionView().catch((err: Error) => console.error('[Hadocommun] Decision Viewの起動に失敗しました', err));
			}
		});

		this.addCommand({
			id: 'open-folder-as-decision',
			name: '現在のフォルダをDecision Projectとして開く',
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile) {
					if (!checking) {
						const folderPath = activeFile.parent?.path || '';
						void this.openFolderAsDecision(folderPath).catch((err: Error) => console.error('[Hadocommun] フォルダをDecision Projectとして開けませんでした', err));
					}
					return true;
				}
				return false;
			}
		});

		// AI Agent コマンドを追加
		this.addCommand({
			id: 'open-ai-agent',
			name: 'AI Agentを開く',
			callback: () => {
				void this.activateAIAgentView().catch((err: Error) => console.error('[Hadocommun] AI Agentの起動に失敗しました', err));
			}
		});

		this.addSettingTab(new HadocommunSettingTab(this.app, this));

		// ファイルエクスプローラーのコンテキストメニューを拡張
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu: Menu, file: TAbstractFile) => {
				// フォルダの場合
				if (file instanceof TFolder) {
					// スマートオープン（自動判別）
					menu.addItem((item: MenuItem) => {
						item.setTitle('プロジェクトを開く')
							.setIcon('folder-open')
							.onClick(() => {
								void this.smartOpenFolder(file.path).catch((err: Error) => 
									console.error('[Hadocommun] フォルダを開けませんでした', err));
							});
					});

					menu.addSeparator();

					menu.addItem((item: MenuItem) => {
						item.setTitle('WBSとして開く')
							.setIcon('layout-list')
							.onClick(() => {
								void this.openFolderAsWBS(file.path, true).catch((err: Error) => 
									console.error('[Hadocommun] フォルダをWBSとして開けませんでした', err));
							});
					});

					menu.addItem((item: MenuItem) => {
						item.setTitle('Decision Projectとして開く')
							.setIcon('scale')
							.onClick(() => {
								void this.openFolderAsDecision(file.path, true).catch((err: Error) => 
									console.error('[Hadocommun] フォルダをDecision Projectとして開けませんでした', err));
							});
					});

					// Decisionノート作成サブメニュー
					if (this.settings.decisionEnabled) {
						menu.addSeparator();
						
						// プロジェクト設定ノートが存在するか確認
						const projectConfigPath = this.findDecisionProjectConfig(file.path);
						const projectName = projectConfigPath 
							? this.getFileBasename(projectConfigPath)
							: null;

						for (const template of DECISION_TEMPLATES) {
							menu.addItem((item: MenuItem) => {
								item.setTitle(`Decision: ${template.label}を作成`)
									.setIcon(template.icon)
									.onClick(() => {
										void this.createDecisionNote(file.path, template.type, projectName)
											.catch((err: Error) => console.error('[Hadocommun] Decisionノートの作成に失敗しました', err));
									});
							});
						}
					}
				}
				
				// .baseファイルの場合
				if (file instanceof TFile && file.extension === 'base') {
					menu.addItem((item: MenuItem) => {
						item.setTitle('WBSとして開く')
							.setIcon('layout-list')
							.onClick(() => {
								void this.openBaseFileAsWBS(file.path).catch((err: Error) => console.error('[Hadocommun] .baseファイルをWBSとして開けませんでした', err));
							});
					});
				}
			})
		);

		this.app.workspace.onLayoutReady(() => {
			if (this.settings.useH1ForGraphNodes) {
				this.handleLayoutChange();
				this.startLabelLoop();
			}
		});

		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				if (this.settings.useH1ForGraphNodes) {
					this.handleLayoutChange();
					this.startLabelLoop();
				}
			})
		);

		this.registerEvent(
			this.app.vault.on('modify', (file: TAbstractFile) => {
				if (file instanceof TFile) {
					if (file.extension === 'md' || file.extension === 'canvas') {
						this.labelManager.invalidateFileCache(file.path);
					}
					// WBS Viewに変更を通知
					this.notifyWBSViews(file);
					// Decision Viewに変更を通知
					this.notifyDecisionViews(file);
				}
			})
		);

		this.registerEvent(
			this.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => {
				if (file instanceof TFile && (file.extension === 'md' || file.extension === 'canvas')) {
					this.labelManager.invalidateFileCache(oldPath);
					this.labelManager.invalidateFileCache(file.path);
				}
			})
		);

		this.registerEvent(
			this.app.vault.on('create', (file: TAbstractFile) => {
				if (file instanceof TFile) {
					this.notifyWBSViews(file);
					this.notifyDecisionViews(file);
				}
			})
		);

		this.registerEvent(
			this.app.vault.on('delete', (file: TAbstractFile) => {
				if (file instanceof TFile) {
					this.refreshAllWBSViews();
					this.refreshAllDecisionViews();
				}
			})
		);
	}

	onunload() {
		this.stopLabelLoop();
		this.resetGraphLabels();
	}

	async loadSettings() {
		const loaded: unknown = await this.loadData();
		const persisted = isRecord(loaded) ? loaded : {};
		this.settings = {
			...DEFAULT_SETTINGS,
			greeting:
				typeof persisted.greeting === 'string'
					? persisted.greeting
					: DEFAULT_SETTINGS.greeting,
			useH1ForGraphNodes:
				typeof persisted.useH1ForGraphNodes === 'boolean'
					? persisted.useH1ForGraphNodes
					: DEFAULT_SETTINGS.useH1ForGraphNodes,
			wbsEnabled:
				typeof persisted.wbsEnabled === 'boolean'
					? persisted.wbsEnabled
					: DEFAULT_SETTINGS.wbsEnabled,
			decisionEnabled:
				typeof persisted.decisionEnabled === 'boolean'
					? persisted.decisionEnabled
					: DEFAULT_SETTINGS.decisionEnabled,
			aiAgentEnabled:
				typeof persisted.aiAgentEnabled === 'boolean'
					? persisted.aiAgentEnabled
					: DEFAULT_SETTINGS.aiAgentEnabled,
			aiAgentSettings:
				isRecord(persisted.aiAgentSettings)
					? { ...DEFAULT_AI_AGENT_SETTINGS, ...(persisted.aiAgentSettings as unknown as Partial<AIAgentSettings>) }
					: DEFAULT_SETTINGS.aiAgentSettings,
		};
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	handleLayoutChange() {
		this.currentRenderer = null;
		this.currentRenderer = this.findRenderer();
	}

	stopLabelLoop() {
		if (this.labelInterval !== null) {
			window.clearInterval(this.labelInterval);
			this.labelInterval = null;
		}
	}

	private findRenderer(): GraphRenderer | null {
		const leaves = [
			...this.app.workspace.getLeavesOfType('graph'),
			...this.app.workspace.getLeavesOfType('localgraph')
		];
		for (const leaf of leaves) {
			const view = (leaf as { view?: { renderer?: unknown } }).view;
			const renderer = view?.renderer as GraphRenderer | undefined;
			if (this.isRenderer(renderer)) {
				return renderer;
			}
		}
		return null;
	}

	private isRenderer(renderer: GraphRenderer | undefined): renderer is GraphRenderer {
		return !!(renderer && renderer.px && renderer.px.stage && Array.isArray(renderer.nodes));
	}

	private getRenderableNodes(renderer: GraphRenderer): RenderableNode[] {
		const result: RenderableNode[] = [];
		if (renderer.nodeLookup && typeof renderer.nodeLookup === 'object') {
			for (const [key, value] of Object.entries(renderer.nodeLookup)) {
				const node = value as GraphNode;
				const id = key || node.path || node.id;
				const textNode = node.text;
				if (id && textNode) {
					result.push({ id, textNode, rawNode: node });
				}
			}
		}
		if (result.length === 0 && Array.isArray(renderer.nodes)) {
			for (const value of renderer.nodes) {
				const node = value as GraphNode;
				const id = node.id ?? node.path;
				const textNode = node.text;
				if (id && textNode) {
					result.push({ id, textNode, rawNode: node });
				}
			}
		}
		return result;
	}

	private async getH1ForNode(nodeId: string): Promise<string | null> {
		return await this.labelManager.getH1ForNode(nodeId, (id) => this.resolveFileFromId(id));
	}

	private resolveFileFromId(nodeId: string): TFile | null {
		const exact = this.app.vault.getAbstractFileByPath(nodeId);
		if (exact instanceof TFile) return exact;
		
		// .md または .canvas 拡張子を追加して試行
		for (const ext of ['md', 'canvas']) {
			const withExt = nodeId.endsWith(`.${ext}`) ? nodeId : `${nodeId}.${ext}`;
			const withExtFile = this.app.vault.getAbstractFileByPath(withExt);
			if (withExtFile instanceof TFile) return withExtFile;
		}
		
		const linkDest = this.app.metadataCache.getFirstLinkpathDest(nodeId.replace(/\.(md|canvas)$/i, ''), '');
		if (linkDest) return linkDest;
		
		const byBase = this.app.vault.getMarkdownFiles().find((f: TFile) => f.basename === nodeId || f.path === nodeId || f.path.endsWith(`/${nodeId}`));
		return byBase ?? null;
	}

	async updateGraphLabels() {
		if (!this.settings.useH1ForGraphNodes) return;
		const renderer = this.currentRenderer || this.findRenderer();
		if (!renderer) return;

		const nodes = this.getRenderableNodes(renderer);
		if (nodes.length === 0) return;

		for (const { id, textNode, rawNode } of nodes) {
			if (!id || !textNode) continue;

			if (!this.originalLabels.has(id) && typeof textNode.text === 'string') {
				this.originalLabels.set(id, textNode.text);
			}

			const h1 = await this.getH1ForNode(id);
			if (h1 && textNode.text !== h1) {
				textNode.text = h1;
				if (typeof textNode.updateText === 'function') {
					try {
						textNode.updateText(true);
					} catch {
						// Silently ignore PIXI update errors
					}
				}
				textNode.dirty = true;
				rawNode.fontDirty = true;
			}
		}
	}

	resetGraphLabels() {
		const renderer = this.currentRenderer;
		const nodes = renderer ? this.getRenderableNodes(renderer) : [];
		for (const { id, textNode } of nodes) {
			const originalName = this.originalLabels.get(id);
			if (originalName && textNode && textNode.text !== originalName) {
				textNode.text = originalName;
				if (typeof textNode.updateText === 'function') {
					try {
						textNode.updateText(true);
					} catch {
						// Silently ignore PIXI update errors
					}
				}
				textNode.dirty = true;
			}
		}
		this.originalLabels.clear();
		this.labelManager.clearCache();
	}

	startLabelLoop() {
		if (this.labelInterval !== null) return;
		const run = () => void this.updateGraphLabels();
		void this.updateGraphLabels();
		this.labelInterval = window.setInterval(run, 500);
		this.registerInterval(this.labelInterval);
	}

	/**
	 * すべてのWBSビューに変更を通知
	 */
	private notifyWBSViews(file: TFile): void {
		const leaves = this.app.workspace.getLeavesOfType(WBS_VIEW_TYPE);
		for (const leaf of leaves) {
			const view = leaf.view as unknown as { onFileChange?: (file: TFile) => void };
			if (view && typeof view.onFileChange === 'function') {
				view.onFileChange(file);
			}
		}
	}

	/**
	 * すべてのWBSビューを更新
	 */
	private refreshAllWBSViews(): void {
		const leaves = this.app.workspace.getLeavesOfType(WBS_VIEW_TYPE);
		for (const leaf of leaves) {
			const view = leaf.view as unknown as { refresh?: () => void };
			if (view && typeof view.refresh === 'function') {
				view.refresh();
			}
		}
	}

	/**
	 * WBS Viewをアクティブにする（タブとして開く）
	 */
	async activateWBSView(): Promise<WorkspaceLeaf> {
		const { workspace } = this.app;

		// 既存のWBSビューを探す
		let leaf = workspace.getLeavesOfType(WBS_VIEW_TYPE)[0];

		if (!leaf) {
			// 新しいタブとして開く（右ペインではなくメインエリア）
			leaf = workspace.getLeaf('tab');
			await leaf.setViewState({ type: WBS_VIEW_TYPE, active: true });
		}

		await workspace.revealLeaf(leaf);
		return leaf;
	}

	/**
	 * フォルダをWBSとして開く
	 * @param folderPath フォルダパス
	 * @param saveConfig .nexuspmに設定を保存するか
	 */
	async openFolderAsWBS(folderPath: string, saveConfig: boolean = false): Promise<void> {
		console.debug('[WBS] Opening folder as WBS:', folderPath);
		
		// .nexuspmに設定を保存
		if (saveConfig) {
			await this.projectConfigManager.initializeProject(folderPath, 'wbs');
		}
		
		// 既存のWBSビューを探すか、新しいタブを作成
		let leaf = this.app.workspace.getLeavesOfType(WBS_VIEW_TYPE)[0];
		
		if (!leaf) {
			leaf = this.app.workspace.getLeaf('tab');
			await leaf.setViewState({ 
				type: WBS_VIEW_TYPE, 
				active: true,
				state: { folder: folderPath }
			});
		} else {
			// 既存のビューにフォルダをロード
			await this.app.workspace.revealLeaf(leaf);
			const view = leaf.view as WBSView;
			if (view && typeof view.loadFolder === 'function') {
				await view.loadFolder(folderPath);
			}
		}
	}

	/**
	 * .baseファイルをWBSとして開く
	 */
	async openBaseFileAsWBS(baseFilePath: string): Promise<void> {
		console.debug('[WBS] Opening base file as WBS:', baseFilePath);
		
		let leaf = this.app.workspace.getLeavesOfType(WBS_VIEW_TYPE)[0];
		
		if (!leaf) {
			leaf = this.app.workspace.getLeaf('tab');
			await leaf.setViewState({ 
				type: WBS_VIEW_TYPE, 
				active: true,
				state: { baseFile: baseFilePath }
			});
		} else {
			await this.app.workspace.revealLeaf(leaf);
			const view = leaf.view as WBSView;
			if (view && typeof view.loadBaseFile === 'function') {
				await view.loadBaseFile(baseFilePath);
			}
		}
	}

	/**
	 * すべてのDecision Viewに変更を通知
	 */
	private notifyDecisionViews(file: TFile): void {
		const leaves = this.app.workspace.getLeavesOfType(DECISION_VIEW_TYPE);
		for (const leaf of leaves) {
			const view = leaf.view as unknown as { onFileChange?: (file: TFile) => void };
			if (view && typeof view.onFileChange === 'function') {
				view.onFileChange(file);
			}
		}
	}

	/**
	 * すべてのDecision Viewを更新
	 */
	private refreshAllDecisionViews(): void {
		const leaves = this.app.workspace.getLeavesOfType(DECISION_VIEW_TYPE);
		for (const leaf of leaves) {
			const view = leaf.view as unknown as { refresh?: () => void };
			if (view && typeof view.refresh === 'function') {
				view.refresh();
			}
		}
	}

	/**
	 * Decision Viewをアクティブにする（タブとして開く）
	 */
	async activateDecisionView(): Promise<WorkspaceLeaf> {
		const { workspace } = this.app;

		// 既存のDecisionビューを探す
		let leaf = workspace.getLeavesOfType(DECISION_VIEW_TYPE)[0];

		if (!leaf) {
			// 新しいタブとして開く
			leaf = workspace.getLeaf('tab');
			await leaf.setViewState({ type: DECISION_VIEW_TYPE, active: true });
		}

		await workspace.revealLeaf(leaf);
		return leaf;
	}

	/**
	 * AI Agent Viewをアクティブにする（サイドパネルとして開く）
	 */
	async activateAIAgentView(targetFolder?: string): Promise<AIAgentView> {
		const { workspace } = this.app;

		// 既存のAI Agentビューを探す
		let leaf = workspace.getLeavesOfType(AI_AGENT_VIEW_TYPE)[0];

		if (!leaf) {
			// 右サイドバーに開く
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				leaf = rightLeaf;
				await leaf.setViewState({
					type: AI_AGENT_VIEW_TYPE,
					active: true
				});
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
			const view = leaf.view as AIAgentView;
			
			// ターゲットフォルダを設定
			if (targetFolder && view) {
				view.setTargetFolder(targetFolder);
			}
			
			return view;
		}

		throw new Error('AI Agent Viewを開けませんでした');
	}

	/**
	 * フォルダをDecision Projectとして開く
	 * @param folderPath フォルダパス
	 * @param saveConfig .nexuspmに設定を保存するか
	 */
	async openFolderAsDecision(folderPath: string, saveConfig: boolean = false): Promise<void> {
		console.debug('[Decision] Opening folder as Decision Project:', folderPath);
		
		// .nexuspmに設定を保存
		if (saveConfig) {
			await this.projectConfigManager.initializeProject(folderPath, 'decision');
		}
		
		// 既存のDecisionビューを探すか、新しいタブを作成
		let leaf = this.app.workspace.getLeavesOfType(DECISION_VIEW_TYPE)[0];
		
		if (!leaf) {
			leaf = this.app.workspace.getLeaf('tab');
			await leaf.setViewState({ 
				type: DECISION_VIEW_TYPE, 
				active: true,
				state: { folder: folderPath }
			});
		} else {
			// 既存のビューにフォルダをロード
			await this.app.workspace.revealLeaf(leaf);
			const view = leaf.view as DecisionView;
			if (view && typeof view.loadFolder === 'function') {
				await view.loadFolder(folderPath);
			}
		}
	}

	/**
	 * フォルダ内のDecision Project設定ノートを検索
	 */
	private findDecisionProjectConfig(folderPath: string): string | null {
		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		if (!(folder instanceof TFolder)) return null;

		// _project.md を優先的に探す
		for (const child of folder.children) {
			if (child instanceof TFile && child.extension === 'md') {
				if (child.basename.startsWith('_project')) {
					const cache = this.app.metadataCache.getFileCache(child);
					const frontmatter = cache?.frontmatter;
					if (frontmatter?.['nexuspm-type'] === 'decision-project') {
						return child.path;
					}
				}
			}
		}

		// 他のファイルも探す
		for (const child of folder.children) {
			if (child instanceof TFile && child.extension === 'md') {
				const cache = this.app.metadataCache.getFileCache(child);
				const frontmatter = cache?.frontmatter;
				if (frontmatter?.['nexuspm-type'] === 'decision-project') {
					return child.path;
				}
			}
		}

		return null;
	}

	/**
	 * フォルダをスマートに開く（プロジェクトタイプを自動判別）
	 */
	async smartOpenFolder(folderPath: string): Promise<void> {
		console.debug('[Hadocommun] Smart opening folder:', folderPath);
		
		const projectType = await this.projectConfigManager.detectProjectType(folderPath);
		
		switch (projectType) {
			case 'wbs':
				await this.openFolderAsWBS(folderPath);
				break;
			case 'decision':
				await this.openFolderAsDecision(folderPath);
				break;
			case 'unknown':
			default:
				// タイプが不明な場合はユーザーに選択させる
				new Notice('プロジェクトタイプを判別できませんでした。「WBSとして開く」または「Decision Projectとして開く」を選択してください。');
				break;
		}
	}

	/**
	 * ファイルパスからベース名を取得
	 */
	private getFileBasename(filePath: string): string {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (file instanceof TFile) {
			return file.basename;
		}
		// ファイルがない場合はパスから推測
		const parts = filePath.split('/');
		const fileName = parts[parts.length - 1];
		return fileName.replace(/\.md$/, '');
	}

	/**
	 * Decisionノートを作成
	 */
	async createDecisionNote(folderPath: string, noteType: DecisionItemType, projectName: string | null): Promise<void> {
		console.debug('[Decision] Creating note:', { folderPath, noteType, projectName });

		const template = DECISION_TEMPLATES.find(t => t.type === noteType);
		if (!template) {
			new Notice('テンプレートが見つかりません');
			return;
		}

		// ユニークなファイル名を生成
		let fileName = template.defaultFileName;
		let filePath = `${folderPath}/${fileName}.md`;
		let counter = 1;

		while (this.app.vault.getAbstractFileByPath(filePath)) {
			fileName = `${template.defaultFileName}${counter}`;
			filePath = `${folderPath}/${fileName}.md`;
			counter++;
		}

		// テンプレート内容を生成
		const content = getTemplateContent(noteType, fileName, projectName || undefined);

		try {
			// ファイルを作成
			const newFile = await this.app.vault.create(filePath, content);
			
			// 作成したファイルを開く
			const leaf = this.app.workspace.getLeaf('tab');
			await leaf.openFile(newFile);
			
			new Notice(`${template.label}ノートを作成しました: ${fileName}`);
		} catch (error) {
			console.error('[Decision] Failed to create note:', error);
			new Notice('ノートの作成に失敗しました');
		}
	}
}

class HadocommunSettingTab extends PluginSettingTab {
	plugin: HadocommunPlugin;

	constructor(app: App, plugin: HadocommunPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

		display(): void {
			const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('表示')
			.setHeading();

		new Setting(containerEl)
			.setName('挨拶メッセージ')
			.setDesc('メッセージ通知に表示される挨拶文')
			.addText(text => text
				.setPlaceholder('挨拶を入力')
				.setValue(this.plugin.settings.greeting)
				.onChange(async (value: string) => {
					this.plugin.settings.greeting = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('グラフノードのラベルに見出し1を使う')
			.setDesc('グラフビューで、各ファイルの最初の見出し1をラベルとして表示します')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.useH1ForGraphNodes)
				.onChange(async (value: boolean) => {
					this.plugin.settings.useH1ForGraphNodes = value;
					await this.plugin.saveSettings();
					if (value) {
						this.plugin.handleLayoutChange();
						this.plugin.startLabelLoop();
						await this.plugin.updateGraphLabels();
					} else {
						this.plugin.stopLabelLoop();
						this.plugin.resetGraphLabels();
					}
				}));

		new Setting(containerEl)
			.setName('WBSビュー')
			.setHeading();

		new Setting(containerEl)
			.setName('WBSビューを有効化')
			.setDesc('フォルダ内のタスクをWBS（Work Breakdown Structure）形式で表示・管理します')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.wbsEnabled)
				.onChange(async (value: boolean) => {
					this.plugin.settings.wbsEnabled = value;
					await this.plugin.saveSettings();
				}));

		// WBS使用方法のヘルプ
			const wbsHelp = containerEl.createDiv({ cls: 'setting-item' });
			wbsHelp.appendChild(document.createRange().createContextualFragment(`
<div class="setting-item-info">
	<div class="setting-item-name">WBSの使い方</div>
	<div class="setting-item-description">
		<ol style="margin: 0.5em 0; padding-left: 1.5em;">
			<li>フォルダを右クリック → 「WBSとして開く」</li>
			<li>タスクファイルのフロントマターに以下を設定:
				<ul style="margin-top: 0.5em;">
					<li><code>parent</code>: 親タスクへのリンク（例: <code>[[親タスク]]</code>）</li>
					<li><code>status</code>: ステータス（not-started, in-progress, completed, blocked）</li>
					<li><code>assignee</code>: 担当者名</li>
					<li><code>due-date</code>: 期限（YYYY-MM-DD形式）</li>
					<li><code>progress</code>: 進捗率（0-100）</li>
				</ul>
			</li>
		</ol>
	</div>
</div>
			`));

		new Setting(containerEl)
			.setName('Decision Project')
			.setHeading();

		new Setting(containerEl)
			.setName('Decision Projectを有効化')
			.setDesc('意思決定を伴うプロジェクトを統合管理します（選択肢比較、リスク管理、意思決定ログ）')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.decisionEnabled)
				.onChange(async (value: boolean) => {
					this.plugin.settings.decisionEnabled = value;
					await this.plugin.saveSettings();
				}));

		// Decision使用方法のヘルプ
		const decisionHelp = containerEl.createDiv({ cls: 'setting-item' });
		decisionHelp.appendChild(document.createRange().createContextualFragment(`
<div class="setting-item-info">
	<div class="setting-item-name">Decision Projectの使い方</div>
	<div class="setting-item-description">
		<ol style="margin: 0.5em 0; padding-left: 1.5em;">
			<li>フォルダを右クリック → 「Decision Projectとして開く」</li>
			<li>プロジェクト設定ノート（<code>nexuspm-type: decision-project</code>）を作成</li>
			<li>以下のノートタイプをフロントマターで指定:
				<ul style="margin-top: 0.5em;">
					<li><code>nexuspm-type: option</code> - 選択肢（候補）</li>
					<li><code>nexuspm-type: decision</code> - 意思決定ログ</li>
					<li><code>nexuspm-type: risk</code> - リスク</li>
					<li><code>nexuspm-type: assumption</code> - 仮説・前提</li>
					<li><code>nexuspm-type: evidence</code> - 根拠・エビデンス</li>
				</ul>
			</li>
		</ol>
	</div>
</div>
		`));

		// AI Agent設定セクション
		new Setting(containerEl)
			.setName('AI Agent')
			.setHeading();

		new Setting(containerEl)
			.setName('AI Agentを有効化')
			.setDesc('Decision Projectの整理をAIがサポートします（メモの分析、タイプ昇格の提案など）')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.aiAgentEnabled)
				.onChange(async (value: boolean) => {
					this.plugin.settings.aiAgentEnabled = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('LLMプロバイダー')
			.setDesc('使用するAIプロバイダーを選択')
			.addDropdown(dropdown => dropdown
				.addOption('openai', 'OpenAI')
				.addOption('anthropic', 'Anthropic')
				.addOption('ollama', 'Ollama (ローカル)')
				.setValue(this.plugin.settings.aiAgentSettings.provider)
				.onChange(async (value: string) => {
					this.plugin.settings.aiAgentSettings.provider = value as LLMProvider;
					await this.plugin.saveSettings();
					this.display(); // 設定画面を更新
				}));

		// OpenAI設定
		if (this.plugin.settings.aiAgentSettings.provider === 'openai') {
			new Setting(containerEl)
				.setName('OpenAI API Key')
				.setDesc('OpenAIのAPIキーを入力')
				.addText(text => text
					.setPlaceholder('sk-...')
					.setValue(this.plugin.settings.aiAgentSettings.openaiApiKey || '')
					.onChange(async (value: string) => {
						this.plugin.settings.aiAgentSettings.openaiApiKey = value;
						await this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName('OpenAIモデル')
				.setDesc('使用するモデルを指定')
				.addText(text => text
					.setPlaceholder('gpt-4o')
					.setValue(this.plugin.settings.aiAgentSettings.openaiModel || 'gpt-4o')
					.onChange(async (value: string) => {
						this.plugin.settings.aiAgentSettings.openaiModel = value;
						await this.plugin.saveSettings();
					}));
		}

		// Anthropic設定
		if (this.plugin.settings.aiAgentSettings.provider === 'anthropic') {
			new Setting(containerEl)
				.setName('Anthropic API Key')
				.setDesc('AnthropicのAPIキーを入力')
				.addText(text => text
					.setPlaceholder('sk-ant-...')
					.setValue(this.plugin.settings.aiAgentSettings.anthropicApiKey || '')
					.onChange(async (value: string) => {
						this.plugin.settings.aiAgentSettings.anthropicApiKey = value;
						await this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName('Anthropicモデル')
				.setDesc('使用するモデルを指定')
				.addText(text => text
					.setPlaceholder('claude-sonnet-4-20250514')
					.setValue(this.plugin.settings.aiAgentSettings.anthropicModel || 'claude-sonnet-4-20250514')
					.onChange(async (value: string) => {
						this.plugin.settings.aiAgentSettings.anthropicModel = value;
						await this.plugin.saveSettings();
					}));
		}

		// Ollama設定
		if (this.plugin.settings.aiAgentSettings.provider === 'ollama') {
			new Setting(containerEl)
				.setName('OllamaベースURL')
				.setDesc('OllamaサーバーのURL')
				.addText(text => text
					.setPlaceholder('http://localhost:11434')
					.setValue(this.plugin.settings.aiAgentSettings.ollamaBaseUrl || 'http://localhost:11434')
					.onChange(async (value: string) => {
						this.plugin.settings.aiAgentSettings.ollamaBaseUrl = value;
						await this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName('Ollamaモデル')
				.setDesc('使用するモデルを指定')
				.addText(text => text
					.setPlaceholder('llama3.2')
					.setValue(this.plugin.settings.aiAgentSettings.ollamaModel || 'llama3.2')
					.onChange(async (value: string) => {
						this.plugin.settings.aiAgentSettings.ollamaModel = value;
						await this.plugin.saveSettings();
					}));
		}

		// 共通AI設定
		new Setting(containerEl)
			.setName('最大トークン数')
			.setDesc('AIの応答の最大トークン数')
			.addText(text => text
				.setPlaceholder('4096')
				.setValue(String(this.plugin.settings.aiAgentSettings.maxTokens || 4096))
				.onChange(async (value: string) => {
					const num = parseInt(value, 10);
					if (!isNaN(num) && num > 0) {
						this.plugin.settings.aiAgentSettings.maxTokens = num;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Temperature')
			.setDesc('AIの応答のランダム性（0.0-1.0）')
			.addText(text => text
				.setPlaceholder('0.7')
				.setValue(String(this.plugin.settings.aiAgentSettings.temperature || 0.7))
				.onChange(async (value: string) => {
					const num = parseFloat(value);
					if (!isNaN(num) && num >= 0 && num <= 1) {
						this.plugin.settings.aiAgentSettings.temperature = num;
						await this.plugin.saveSettings();
					}
				}));

		// AI Agent使用方法のヘルプ
		const aiHelp = containerEl.createDiv({ cls: 'setting-item' });
		aiHelp.appendChild(document.createRange().createContextualFragment(`
<div class="setting-item-info">
	<div class="setting-item-name">AI Agentの使い方</div>
	<div class="setting-item-description">
		<ol style="margin: 0.5em 0; padding-left: 1.5em;">
			<li>上記でLLMプロバイダーとAPIキーを設定</li>
			<li>リボンの「AI Agent」アイコンをクリック、または コマンドパレットから「AI Agentを開く」</li>
			<li>対象フォルダを選択し、メッセージを入力</li>
			<li>AIがメモを分析し、選択肢やリスクへの昇格を提案します</li>
		</ol>
	</div>
</div>
		`));
		}
}
