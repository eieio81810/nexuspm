import { App, Plugin, PluginSettingTab, Setting, Notice, TFile } from 'obsidian';
import { GraphLabelManager } from './src/graphLabelManager';

interface HadocommunPluginSettings {
	greeting: string;
	useH1ForGraphNodes: boolean;
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
	useH1ForGraphNodes: false
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

		const ribbonIconEl = this.addRibbonIcon('dice', 'Hadocommun', (evt: MouseEvent) => {
			new Notice(this.settings.greeting);
		});
		ribbonIconEl.addClass('hadocommun-ribbon-class');

		this.addCommand({
			id: 'show-greeting',
			name: 'Show greeting message',
			callback: () => {
				new Notice(this.settings.greeting);
			}
		});

		this.addSettingTab(new HadocommunSettingTab(this.app, this));

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
				if (file instanceof TFile && (file.extension === 'md' || file.extension === 'canvas')) {
					this.labelManager.invalidateFileCache(file.path);
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
	}

	onunload() {
		this.stopLabelLoop();
		this.resetGraphLabels();
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
	}
}
