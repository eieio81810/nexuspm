/**
 * Agent Tools - ファイル操作ツール
 * 
 * AIエージェントがVault内のファイルを操作するためのツール群
 */

import { App, TFile, TFolder, TAbstractFile, normalizePath } from 'obsidian';
import { ToolDefinition, ToolCall, ToolResult } from './aiAgentDataModel';

/**
 * ツール定義一覧
 */
export const AGENT_TOOLS: ToolDefinition[] = [
	{
		name: 'list_files',
		description: '指定フォルダ内のファイル一覧を取得します。サブフォルダも含めて再帰的にリストできます。',
		parameters: {
			type: 'object',
			properties: {
				folder: {
					type: 'string',
					description: '対象フォルダのパス（例: "Projects/Decision1"）。空文字列でVaultルート'
				},
				recursive: {
					type: 'boolean',
					description: 'サブフォルダも含めて再帰的にリストするか（デフォルト: false）'
				},
				extension: {
					type: 'string',
					description: 'フィルターする拡張子（例: "md"）。指定なしで全ファイル'
				}
			},
			required: ['folder']
		}
	},
	{
		name: 'read_file',
		description: 'ファイルの内容を読み取ります。frontmatterとコンテンツを含みます。',
		parameters: {
			type: 'object',
			properties: {
				path: {
					type: 'string',
					description: 'ファイルパス（例: "Projects/Decision1/memo1.md"）'
				}
			},
			required: ['path']
		}
	},
	{
		name: 'update_frontmatter',
		description: 'ファイルのfrontmatterを更新します。既存のフィールドを上書きまたは新規追加します。',
		parameters: {
			type: 'object',
			properties: {
				path: {
					type: 'string',
					description: 'ファイルパス'
				},
				updates: {
					type: 'object',
					description: '更新するfrontmatterフィールドのオブジェクト（例: {"type": "option", "status": "active"}）'
				}
			},
			required: ['path', 'updates']
		}
	},
	{
		name: 'create_file',
		description: '新しいMarkdownファイルを作成します。',
		parameters: {
			type: 'object',
			properties: {
				path: {
					type: 'string',
					description: '作成するファイルのパス（例: "Projects/Decision1/new_option.md"）'
				},
				content: {
					type: 'string',
					description: 'ファイルの内容（frontmatter含む）'
				}
			},
			required: ['path', 'content']
		}
	},
	{
		name: 'move_file',
		description: 'ファイルを別の場所に移動します。',
		parameters: {
			type: 'object',
			properties: {
				from: {
					type: 'string',
					description: '移動元のファイルパス'
				},
				to: {
					type: 'string',
					description: '移動先のファイルパス'
				}
			},
			required: ['from', 'to']
		}
	},
	{
		name: 'delete_file',
		description: 'ファイルを削除します（ゴミ箱に移動）。',
		parameters: {
			type: 'object',
			properties: {
				path: {
					type: 'string',
					description: '削除するファイルのパス'
				}
			},
			required: ['path']
		}
	}
];

/**
 * ツール実行クラス
 */
export class AgentToolExecutor {
	private app: App;
	private targetFolder: string;

	constructor(app: App, targetFolder?: string) {
		this.app = app;
		this.targetFolder = targetFolder || '';
	}

	/**
	 * ターゲットフォルダを設定
	 */
	setTargetFolder(folder: string): void {
		this.targetFolder = folder;
	}

	/**
	 * パスを解決（ターゲットフォルダからの相対パス）
	 */
	private resolvePath(path: string): string {
		if (!path) return this.targetFolder;
		if (path.startsWith('/')) {
			// 絶対パス
			return normalizePath(path.substring(1));
		}
		if (this.targetFolder) {
			return normalizePath(`${this.targetFolder}/${path}`);
		}
		return normalizePath(path);
	}

	/**
	 * ツールを実行
	 */
	async execute(toolCall: ToolCall): Promise<ToolResult> {
		const { id, name, arguments: args } = toolCall;

		try {
			let result: string;

			switch (name) {
				case 'list_files':
					result = await this.listFiles(
						args.folder as string,
						args.recursive as boolean | undefined,
						args.extension as string | undefined
					);
					break;
				case 'read_file':
					result = await this.readFile(args.path as string);
					break;
				case 'update_frontmatter':
					result = await this.updateFrontmatter(
						args.path as string,
						args.updates as Record<string, unknown>
					);
					break;
				case 'create_file':
					result = await this.createFile(
						args.path as string,
						args.content as string
					);
					break;
				case 'move_file':
					result = await this.moveFile(
						args.from as string,
						args.to as string
					);
					break;
				case 'delete_file':
					result = await this.deleteFile(args.path as string);
					break;
				default:
					return {
						callId: id,
						name,
						result: '',
						error: `Unknown tool: ${name}`
					};
			}

			return {
				callId: id,
				name,
				result
			};
		} catch (error) {
			return {
				callId: id,
				name,
				result: '',
				error: error instanceof Error ? error.message : String(error)
			};
		}
	}

	/**
	 * フォルダ内ファイル一覧
	 */
	private async listFiles(
		folder: string,
		recursive?: boolean,
		extension?: string
	): Promise<string> {
		const folderPath = this.resolvePath(folder);
		const abstractFile = folderPath 
			? this.app.vault.getAbstractFileByPath(folderPath)
			: this.app.vault.getRoot();

		if (!abstractFile) {
			throw new Error(`Folder not found: ${folderPath}`);
		}

		if (!(abstractFile instanceof TFolder)) {
			throw new Error(`Not a folder: ${folderPath}`);
		}

		const files: { path: string; name: string; type: string }[] = [];
		
		const collectFiles = (folder: TFolder, depth: number = 0) => {
			for (const child of folder.children) {
				if (child instanceof TFile) {
					if (!extension || child.extension === extension) {
						files.push({
							path: child.path,
							name: child.name,
							type: 'file'
						});
					}
				} else if (child instanceof TFolder) {
					files.push({
						path: child.path,
						name: child.name,
						type: 'folder'
					});
					if (recursive) {
						collectFiles(child, depth + 1);
					}
				}
			}
		};

		collectFiles(abstractFile);

		return JSON.stringify({
			folder: folderPath || '/',
			count: files.length,
			files
		}, null, 2);
	}

	/**
	 * ファイル読み取り
	 */
	private async readFile(path: string): Promise<string> {
		const filePath = this.resolvePath(path);
		const file = this.app.vault.getAbstractFileByPath(filePath);

		if (!file) {
			throw new Error(`File not found: ${filePath}`);
		}

		if (!(file instanceof TFile)) {
			throw new Error(`Not a file: ${filePath}`);
		}

		const content = await this.app.vault.read(file);
		const cache = this.app.metadataCache.getFileCache(file);

		return JSON.stringify({
			path: filePath,
			name: file.name,
			extension: file.extension,
			frontmatter: cache?.frontmatter || {},
			content
		}, null, 2);
	}

	/**
	 * frontmatter更新
	 */
	private async updateFrontmatter(
		path: string,
		updates: Record<string, unknown>
	): Promise<string> {
		const filePath = this.resolvePath(path);
		const file = this.app.vault.getAbstractFileByPath(filePath);

		if (!file) {
			throw new Error(`File not found: ${filePath}`);
		}

		if (!(file instanceof TFile)) {
			throw new Error(`Not a file: ${filePath}`);
		}

		await this.app.fileManager.processFrontMatter(file, (fm) => {
			for (const [key, value] of Object.entries(updates)) {
				if (value === null || value === undefined) {
					delete fm[key];
				} else {
					fm[key] = value;
				}
			}
		});

		return JSON.stringify({
			success: true,
			path: filePath,
			updated: Object.keys(updates)
		});
	}

	/**
	 * ファイル作成
	 */
	private async createFile(path: string, content: string): Promise<string> {
		const filePath = this.resolvePath(path);
		
		// 既存ファイルのチェック
		const existing = this.app.vault.getAbstractFileByPath(filePath);
		if (existing) {
			throw new Error(`File already exists: ${filePath}`);
		}

		// 親フォルダの作成
		const parentPath = filePath.substring(0, filePath.lastIndexOf('/'));
		if (parentPath) {
			const parentFolder = this.app.vault.getAbstractFileByPath(parentPath);
			if (!parentFolder) {
				await this.app.vault.createFolder(parentPath);
			}
		}

		const file = await this.app.vault.create(filePath, content);

		return JSON.stringify({
			success: true,
			path: file.path,
			name: file.name
		});
	}

	/**
	 * ファイル移動
	 */
	private async moveFile(from: string, to: string): Promise<string> {
		const fromPath = this.resolvePath(from);
		const toPath = this.resolvePath(to);

		const file = this.app.vault.getAbstractFileByPath(fromPath);
		if (!file) {
			throw new Error(`File not found: ${fromPath}`);
		}

		if (!(file instanceof TFile)) {
			throw new Error(`Not a file: ${fromPath}`);
		}

		// 移動先フォルダの作成
		const parentPath = toPath.substring(0, toPath.lastIndexOf('/'));
		if (parentPath) {
			const parentFolder = this.app.vault.getAbstractFileByPath(parentPath);
			if (!parentFolder) {
				await this.app.vault.createFolder(parentPath);
			}
		}

		await this.app.fileManager.renameFile(file, toPath);

		return JSON.stringify({
			success: true,
			from: fromPath,
			to: toPath
		});
	}

	/**
	 * ファイル削除
	 */
	private async deleteFile(path: string): Promise<string> {
		const filePath = this.resolvePath(path);
		const file = this.app.vault.getAbstractFileByPath(filePath);

		if (!file) {
			throw new Error(`File not found: ${filePath}`);
		}

		if (!(file instanceof TFile)) {
			throw new Error(`Not a file: ${filePath}`);
		}

		await this.app.vault.trash(file, true);

		return JSON.stringify({
			success: true,
			path: filePath,
			message: 'File moved to trash'
		});
	}
}

/**
 * 複数のツール呼び出しを実行
 */
export async function executeToolCalls(
	executor: AgentToolExecutor,
	toolCalls: ToolCall[]
): Promise<ToolResult[]> {
	const results: ToolResult[] = [];

	for (const toolCall of toolCalls) {
		const result = await executor.execute(toolCall);
		results.push(result);
	}

	return results;
}
