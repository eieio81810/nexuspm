// Obsidian API のモック

export class TFile {
	path: string;
	extension: string;
	basename: string;

	constructor(path: string) {
		this.path = path;
		this.extension = path.split('.').pop() || '';
		this.basename = path.split('/').pop()?.replace(/\.\w+$/, '') || '';
	}
}

export interface CachedMetadata {
	headings?: Array<{ level: number; heading: string }>;
}

export interface MetadataCache {
	getFileCache(file: TFile): CachedMetadata | null;
	getFirstLinkpathDest(linkpath: string, sourcePath: string): TFile | null;
}

export interface Vault {
	read(file: TFile): Promise<string>;
	getAbstractFileByPath(path: string): TFile | null;
	getMarkdownFiles(): TFile[];
}

export class App {
	metadataCache: MetadataCache;
	vault: Vault;
	workspace: unknown;

	constructor() {
		this.metadataCache = {} as MetadataCache;
		this.vault = {} as Vault;
		this.workspace = {};
	}
}

export class Plugin {
	app: App;
	manifest: unknown;

	constructor() {
		this.app = new App();
		this.manifest = {};
	}
}

export class PluginSettingTab {
	constructor(app: App, plugin: Plugin) {}
}

export class Setting {
	constructor(containerEl: HTMLElement) {}
}

export class Notice {
	constructor(message: string) {}
}
