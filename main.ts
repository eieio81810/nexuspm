import { App, Plugin, PluginSettingTab, Setting, Notice, TFile, TFolder, WorkspaceLeaf } from 'obsidian';
import { GraphLabelManager } from './src/graphLabelManager';
import { WBSView, WBS_VIEW_TYPE } from './src/wbs/wbsView';

interface HadocommunPluginSettings {
	greeting: string;
	useH1ForGraphNodes: boolean;
	wbsEnabled: boolean;
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
	wbsEnabled: true
}

export default class HadocommunPlugin extends Plugin {
	settings: HadocommunPluginSettings;
	private currentRenderer: GraphRenderer | null = null;
	private labelInterval: number | null = null;
	private originalLabels: Map<string, string> = new Map();
	public overlayLabels: Map<string, unknown> = new Map();
	private labelManager: GraphLabelManager;

	async onload() {
		await this.loadSettings();

		(window as { hadocommunPlugin?: HadocommunPlugin }).hadocommunPlugin = this;

		this.labelManager = new GraphLabelManager(this.app.metadataCache, this.app.vault);

		// WBS View を登録
		this.registerView(
			WBS_VIEW_TYPE,
			(leaf) => new WBSView(leaf)
		);

		const ribbonIconEl = this.addRibbonIcon('dice', 'Hadocommun', (evt: MouseEvent) => {
			new Notice(this.settings.greeting);
		});
		ribbonIconEl.addClass('hadocommun-ribbon-class');

		// WBS リボンアイコンを追加
		if (this.settings.wbsEnabled) {
			const wbsRibbonEl = this.addRibbonIcon('layout-list', 'Open WBS View', async () => {
				await this.activateWBSView();
			});
			wbsRibbonEl.addClass('wbs-ribbon-class');
		}

		this.addCommand({
			id: 'show-greeting',
			name: 'Show greeting message',
			callback: () => {
				new Notice(this.settings.greeting);
			}
		});

		// WBS コマンドを追加
		this.addCommand({
			id: 'open-wbs-view',
			name: 'Open WBS View',
			callback: async () => {
				await this.activateWBSView();
			}
		});

		this.addCommand({
			id: 'open-folder-as-wbs',
			name: 'Open current folder as WBS',
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile) {
					if (!checking) {
						const folderPath = activeFile.parent?.path || '';
						this.openFolderAsWBS(folderPath);
					}
					return true;
				}
				return false;
			}
		});

		// WBSタグをコピーするコマンド
		this.addCommand({
			id: 'copy-wbs-tags',
			name: 'Copy WBS tags to clipboard',
			checkCallback: (checking: boolean) => {
				const leaves = this.app.workspace.getLeavesOfType(WBS_VIEW_TYPE);
				if (leaves.length > 0) {
					if (!checking) {
						const view = leaves[0].view as WBSView;
						if (view && typeof view.generateWBSTags === 'function') {
							const tags = view.generateWBSTags();
							if (tags.length > 0) {
								const yamlTags = tags.map(t => `  - ${t}`).join('\n');
								navigator.clipboard.writeText(`tags:\n${yamlTags}`);
								new Notice('WBSタグをクリップボードにコピーしました');
							}
						}
					}
					return true;
				}
				return false;
			}
		});

		this.addSettingTab(new HadocommunSettingTab(this.app, this));

		// ファイルエクスプローラーのコンテキストメニューを拡張
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				// フォルダの場合
				if (file instanceof TFolder) {
					menu.addItem((item) => {
						item.setTitle('WBSとして開く')
							.setIcon('layout-list')
							.onClick(async () => {
								await this.openFolderAsWBS(file.path);
							});
					});
				}
				
				// .baseファイルの場合
				if (file instanceof TFile && file.extension === 'base') {
					menu.addItem((item) => {
						item.setTitle('WBSとして開く')
							.setIcon('layout-list')
							.onClick(async () => {
								await this.openBaseFileAsWBS(file.path);
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
			this.app.vault.on('modify', (file) => {
				if (file instanceof TFile) {
					if (file.extension === 'md' || file.extension === 'canvas') {
						this.labelManager.invalidateFileCache(file.path);
					}
					// WBS Viewに変更を通知
					this.notifyWBSViews(file);
				}
			})
		);

		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				if (file instanceof TFile && (file.extension === 'md' || file.extension === 'canvas')) {
					this.labelManager.invalidateFileCache(oldPath);
					this.labelManager.invalidateFileCache(file.path);
				}
			})
		);

		this.registerEvent(
			this.app.vault.on('create', (file) => {
				if (file instanceof TFile) {
					this.notifyWBSViews(file);
				}
			})
		);

		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				if (file instanceof TFile) {
					this.refreshAllWBSViews();
				}
			})
		);
	}

	onunload() {
		this.stopLabelLoop();
		this.resetGraphLabels();
		this.app.workspace.detachLeavesOfType(WBS_VIEW_TYPE);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
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
		
		const byBase = this.app.vault.getMarkdownFiles().find(f => f.basename === nodeId || f.path === nodeId || f.path.endsWith(`/${nodeId}`));
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
		const run = async () => {
			await this.updateGraphLabels();
		};
		void run();
		this.labelInterval = window.setInterval(run, 500);
		this.registerInterval(this.labelInterval);
	}

	/**
	 * すべてのWBSビューに変更を通知
	 */
	private notifyWBSViews(file: TFile): void {
		const leaves = this.app.workspace.getLeavesOfType(WBS_VIEW_TYPE);
		for (const leaf of leaves) {
			const view = leaf.view as WBSView;
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
			const view = leaf.view as WBSView;
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

		workspace.revealLeaf(leaf);
		return leaf;
	}

	/**
	 * フォルダをWBSとして開く
	 */
	async openFolderAsWBS(folderPath: string): Promise<void> {
		console.log('[WBS] Opening folder as WBS:', folderPath);
		
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
			this.app.workspace.revealLeaf(leaf);
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
		console.log('[WBS] Opening base file as WBS:', baseFilePath);
		
		let leaf = this.app.workspace.getLeavesOfType(WBS_VIEW_TYPE)[0];
		
		if (!leaf) {
			leaf = this.app.workspace.getLeaf('tab');
			await leaf.setViewState({ 
				type: WBS_VIEW_TYPE, 
				active: true,
				state: { baseFile: baseFilePath }
			});
		} else {
			this.app.workspace.revealLeaf(leaf);
			const view = leaf.view as WBSView;
			if (view && typeof view.loadBaseFile === 'function') {
				await view.loadBaseFile(baseFilePath);
			}
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
			.setName('Appearance')
			.setHeading();

		new Setting(containerEl)
			.setName('Greeting message')
			.setDesc('メッセージ通知に表示される挨拶文')
			.addText(text => text
				.setPlaceholder('Enter your greeting')
				.setValue(this.plugin.settings.greeting)
				.onChange(async (value) => {
					this.plugin.settings.greeting = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Use H1 for graph node labels')
			.setDesc('Display the first H1 heading of each file as its label in graph view')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.useH1ForGraphNodes)
				.onChange(async (value) => {
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
			.setName('WBS View')
			.setHeading();

		new Setting(containerEl)
			.setName('Enable WBS View')
			.setDesc('フォルダ内のタスクをWBS（Work Breakdown Structure）形式で表示・管理します')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.wbsEnabled)
				.onChange(async (value) => {
					this.plugin.settings.wbsEnabled = value;
					await this.plugin.saveSettings();
				}));

		// WBS使用方法のヘルプ
		const wbsHelp = containerEl.createDiv({ cls: 'setting-item' });
		wbsHelp.innerHTML = `
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
		`;
	}
}
