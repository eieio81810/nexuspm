/**
 * Project Configuration
 * 
 * .nexuspm設定ファイルによるプロジェクトタイプの自動判別
 */

import { TFile, TFolder, Vault, App } from 'obsidian';

/**
 * プロジェクトタイプ
 */
export type ProjectType = 'wbs' | 'decision' | 'unknown';

/**
 * .nexuspm設定ファイルの内容
 */
export interface NexuspmConfig {
	/** プロジェクトタイプ */
	type: ProjectType;
	/** プロジェクト名（オプション） */
	name?: string;
	/** 作成日時 */
	created?: string;
}

/**
 * デフォルト設定
 */
export const DEFAULT_NEXUSPM_CONFIG: NexuspmConfig = {
	type: 'unknown'
};

/**
 * .nexuspm設定ファイル名
 */
export const NEXUSPM_CONFIG_FILENAME = '.nexuspm';

/**
 * ProjectConfigManager
 * 
 * フォルダのプロジェクトタイプを管理する
 */
export class ProjectConfigManager {
	constructor(private app: App) {}

	/**
	 * フォルダのプロジェクトタイプを検出
	 */
	async detectProjectType(folderPath: string): Promise<ProjectType> {
		// 1. .nexuspmファイルをチェック
		const config = await this.readConfig(folderPath);
		if (config && config.type !== 'unknown') {
			return config.type;
		}

		// 2. フォルダ内のファイルから推測
		return this.inferProjectType(folderPath);
	}

	/**
	 * .nexuspm設定ファイルを読み込む
	 */
	async readConfig(folderPath: string): Promise<NexuspmConfig | null> {
		const configPath = `${folderPath}/${NEXUSPM_CONFIG_FILENAME}`;
		const file = this.app.vault.getAbstractFileByPath(configPath);
		
		if (!(file instanceof TFile)) {
			return null;
		}

		try {
			const content = await this.app.vault.read(file);
			return JSON.parse(content) as NexuspmConfig;
		} catch (error) {
			console.warn('[ProjectConfig] Failed to read config:', error);
			return null;
		}
	}

	/**
	 * .nexuspm設定ファイルを作成・更新
	 */
	async writeConfig(folderPath: string, config: NexuspmConfig): Promise<void> {
		const configPath = `${folderPath}/${NEXUSPM_CONFIG_FILENAME}`;
		const content = JSON.stringify(config, null, 2);

		const existingFile = this.app.vault.getAbstractFileByPath(configPath);
		if (existingFile instanceof TFile) {
			await this.app.vault.modify(existingFile, content);
		} else {
			await this.app.vault.create(configPath, content);
		}
	}

	/**
	 * プロジェクトを初期化（.nexuspmファイルを作成）
	 */
	async initializeProject(folderPath: string, type: ProjectType, name?: string): Promise<void> {
		const config: NexuspmConfig = {
			type,
			name: name || this.getFolderName(folderPath),
			created: new Date().toISOString()
		};
		await this.writeConfig(folderPath, config);
	}

	/**
	 * フォルダ内のファイルからプロジェクトタイプを推測
	 */
	private inferProjectType(folderPath: string): ProjectType {
		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		if (!(folder instanceof TFolder)) {
			return 'unknown';
		}

		let hasWbsTask = false;
		let hasDecisionItem = false;

		// フォルダ内のMarkdownファイルをスキャン
		for (const child of folder.children) {
			if (child instanceof TFile && child.extension === 'md') {
				const cache = this.app.metadataCache.getFileCache(child);
				const frontmatter = cache?.frontmatter;

				if (frontmatter) {
					// Decision Projectのマーカーをチェック
					const nexuspmType = frontmatter['nexuspm-type'];
					if (nexuspmType) {
						const decisionTypes = ['decision-project', 'memo', 'option', 'decision', 'risk', 'assumption', 'evidence'];
						if (decisionTypes.includes(nexuspmType)) {
							hasDecisionItem = true;
						}
					}

					// WBSのマーカーをチェック（parentまたはstatusの存在）
					if (frontmatter.parent || frontmatter.status || frontmatter.assignee) {
						// nexuspm-typeがない場合はWBSの可能性
						if (!frontmatter['nexuspm-type']) {
							hasWbsTask = true;
						}
					}
				}
			}

			// .baseファイルの存在をチェック
			if (child instanceof TFile && child.extension === 'base') {
				hasWbsTask = true;
			}
		}

		// Decision Projectを優先（明示的なマーカーがある）
		if (hasDecisionItem) {
			return 'decision';
		}

		// WBSタスクがある場合
		if (hasWbsTask) {
			return 'wbs';
		}

		return 'unknown';
	}

	/**
	 * フォルダ名を取得
	 */
	private getFolderName(folderPath: string): string {
		const parts = folderPath.split('/');
		return parts[parts.length - 1] || folderPath;
	}

	/**
	 * プロジェクトタイプの表示名を取得
	 */
	static getTypeLabel(type: ProjectType): string {
		switch (type) {
			case 'wbs':
				return 'WBS';
			case 'decision':
				return 'Decision Project';
			default:
				return '不明';
		}
	}
}
