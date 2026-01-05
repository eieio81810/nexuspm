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

  export type MetadataCache = any;
  export type Vault = any;
  export type CachedMetadata = any;

  export const Workspace: any;
  export const MarkdownView: any;
}
