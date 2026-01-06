// Minimal Obsidian types for compilation when the real package isn't installed
declare module 'obsidian' {
  export type App = any;

  export class Plugin {
    app: App;
    registerView(type: string, ctor: (leaf: WorkspaceLeaf) => View): void;
    addRibbonIcon(icon: string, title: string, cb: (evt: MouseEvent) => void): HTMLElement;
    addCommand(cmd: { id: string; name: string; callback?: () => void; checkCallback?: (checking: boolean) => boolean }): void;
    addSettingTab(tab: PluginSettingTab): void;
    registerEvent(ev: any): void;
    registerInterval(id: number): void;
    loadData(): Promise<any>;
    saveData(data: any): Promise<void>;
  }

  export class PluginSettingTab {
    app: App;
    plugin: Plugin;
    containerEl: any;
    constructor(app: App, plugin: Plugin);
    display(): void;
  }

  export class Setting {
    constructor(containerEl: any);
    setName(name: string): this;
    setHeading(): this;
    setDesc(desc: string): this;
    addText(cb: (t: { setPlaceholder: (s: string) => any; setValue: (v: string) => any; onChange: (fn: (v: string) => void) => any }) => any): this;
    addToggle(cb: (t: { setValue: (v: boolean) => any; onChange: (fn: (v: boolean) => void) => any }) => any): this;
  }

  export class Notice {
    constructor(message: string);
  }

  export class TFile {
    path: string;
    extension: string;
    basename: string;
    parent?: TFolder;
    constructor(path?: string);
  }

  export class TFolder {
    path: string;
    constructor(path?: string);
  }

  export type WorkspaceLeaf = any;

  export interface View {
    getState(): Record<string, unknown>;
  }

  // Basic Vault / MetadataCache impressions used by code
  export interface CachedMetadata {
    frontmatter?: Record<string, unknown>;
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
    modify?(file: TFile, content: string): Promise<void>;
  }

  // Simplified Workspace interface for methods used in source
  export interface Workspace {
    getLeavesOfType(type: string): WorkspaceLeaf[];
    revealLeaf(leaf: WorkspaceLeaf): void;
    getLeaf(type?: string): any;
    requestSaveLayout(): void;
    detachLeavesOfType?(type: string): void;
  }

  // View state result placeholder
  export type ViewStateResult = any;

  // ItemView class provides app and contentEl used by views
  export class ItemView implements View {
    public app: App;
    public leaf: WorkspaceLeaf;
    public contentEl: any;
    constructor(leaf: WorkspaceLeaf) {
      this.leaf = leaf;
      this.app = (undefined as unknown) as App;
      this.contentEl = ({} as any);
    }
    getViewType(): string { return '' }
    getState(): Record<string, unknown> { return {} }
    async setState(state: Record<string, unknown>, result: ViewStateResult): Promise<void> { return; }
    getDisplayText(): string { return '' }
    getIcon(): string { return '' }
    async onOpen(): Promise<void> { return; }
    async onClose(): Promise<void> { return; }
  }

  // Menu / MenuItem minimal types
  export class MenuItem {
    setTitle(title: string): this;
    setIcon(icon: string): this;
    onClick(cb: () => void): this;
  }

  export class Menu {
    addItem(cb: (item: MenuItem) => void): Menu;
    addSeparator(): void;
    showAtMouseEvent(e: MouseEvent): void;
  }

  // Modal minimal type
  export class Modal {
    public app: App;
    public contentEl: any;
    constructor(app: App) { this.app = app; this.contentEl = {} as any; }
    open(): void;
    close(): void;
    onOpen?(): void;
    onClose?(): void;
  }

  // Simple helpers
  export const Workspace: any;
  export const MarkdownView: any;
}
