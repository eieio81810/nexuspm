import { TFile, MetadataCache, Vault } from 'obsidian';
import {
	WBSItem,
	WBSProject,
	WBSPropertyMapping,
	DEFAULT_PROPERTY_MAPPING,
	normalizeStatus,
	calculateStartDate,
	calculateDueDate,
	createDefaultWBSItem
} from './wbsDataModel';

export interface WBSParserOptions {
	propertyMapping?: Partial<WBSPropertyMapping>;
	includeSubfolders?: boolean;
}

/**
 * WBSパースエラー
 */
export class WBSParseError extends Error {
	constructor(
		message: string,
		public code: 'NO_ROOT' | 'MULTIPLE_ROOTS' | 'CYCLE_DETECTED' | 'INVALID_PARENT'
	) {
		super(message);
		this.name = 'WBSParseError';
	}
}

interface FrontmatterData {
	[key: string]: unknown;
}

export class WBSParser {
	private propertyMapping: WBSPropertyMapping;

	constructor(
		private metadataCache: MetadataCache,
		private vault: Vault,
		options?: WBSParserOptions
	) {
		this.propertyMapping = {
			...DEFAULT_PROPERTY_MAPPING,
			...options?.propertyMapping
		};
	}

	/**
	 * 単一ファイルをパースしてWBSItemを生成
	 */
	parseFile(file: TFile): WBSItem | null {
		const cache = this.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter as FrontmatterData | undefined;

		const item = createDefaultWBSItem(file.path, file.basename);

		// タイトル: H1見出しまたはファイル名
		const h1Heading = cache?.headings?.find(h => h.level === 1);
		if (h1Heading) {
			item.title = h1Heading.heading;
		}

		if (!frontmatter) {
			return item;
		}

		// プロパティをマッピング
		const mapping = this.propertyMapping;

		// 親リンク（バックリンク）
		const parentLink = frontmatter[mapping.parent];
		if (parentLink && typeof parentLink === 'string') {
			item.parentId = this.extractLinkTarget(parentLink);
		}

		// ステータス
		const status = frontmatter[mapping.status];
		if (status && typeof status === 'string') {
			item.status = normalizeStatus(status);
		}

		// 担当者
		const assignee = frontmatter[mapping.assignee];
		if (assignee && typeof assignee === 'string') {
			item.assignee = assignee;
		}

		// 開始日: date + startTime または start-date
		item.startDate = calculateStartDate(frontmatter, mapping);

		// 期限: date + endTime または due-date
		item.dueDate = calculateDueDate(frontmatter, mapping);

		// 進捗
		const progress = frontmatter[mapping.progress];
		if (typeof progress === 'number') {
			item.progress = Math.max(0, Math.min(100, progress));
		}

		// completed チェックボックスが設定されている場合、false または空文字以外は完了とみなす
		const completedField = frontmatter[mapping.completed as keyof FrontmatterData];
		if (completedField !== undefined) {
			let isCompleted = false;
			if (typeof completedField === 'boolean') {
				isCompleted = completedField === true;
			} else if (typeof completedField === 'string') {
				const v = completedField.trim().toLowerCase();
				isCompleted = v !== '' && v !== 'false' && v !== '0';
			} else if (typeof completedField === 'number') {
				isCompleted = completedField !== 0;
			} else if (Array.isArray(completedField)) {
				// 配列の場合、中身に真値やチェック表現があれば完了とみなす
				isCompleted = completedField.some(val => {
					if (typeof val === 'boolean') return val === true;
					if (typeof val === 'number') return val !== 0;
					if (typeof val === 'string') {
						const s = val.trim().toLowerCase();
						return s !== '' && s !== 'false' && s !== '0' && s !== '- [ ]';
					}
					return !!val;
				});
			} else if (typeof completedField === 'object' && completedField !== null) {
				// オブジェクト等は存在すれば完了とみなす
				isCompleted = true;
			}

			// Debug log to help diagnose cases where completed isn't applied
			console.debug('[WBS] parseFile completedField:', file.path, completedField, '-> isCompleted:', isCompleted);

			if (isCompleted) {
				item.progress = 100;
				item.status = 'completed';
			}
		}

		// 見積もり時間
		const estimatedHours = frontmatter[mapping.estimatedHours];
		if (typeof estimatedHours === 'number') {
			item.estimatedHours = estimatedHours;
		}

		// 実績時間
		const actualHours = frontmatter[mapping.actualHours];
		if (typeof actualHours === 'number') {
			item.actualHours = actualHours;
		}

		// 優先度
		const priority = frontmatter[mapping.priority];
		if (typeof priority === 'number') {
			item.priority = priority;
		}

		// WBS番号（明示的に設定されている場合）
		const wbsNumber = frontmatter[mapping.wbsNumber];
		if (wbsNumber && typeof wbsNumber === 'string') {
			item.wbsNumber = wbsNumber;
		}

		// タグ
		if (frontmatter.tags) {
			if (Array.isArray(frontmatter.tags)) {
				item.tags = frontmatter.tags.map(t => String(t));
			} else if (typeof frontmatter.tags === 'string') {
				item.tags = [frontmatter.tags];
			}
		}

		return item;
	}

	/**
	 * フォルダ内のすべてのMarkdownファイルをパースしてWBSProjectを生成
	 */
	parseFolder(folderPath: string): WBSProject {
		const project: WBSProject = {
			id: folderPath,
			name: folderPath.split('/').pop() || folderPath,
			rootItemIds: [],
			items: new Map(),
			lastUpdated: new Date()
		};

		// フォルダ内のMarkdownファイルを取得
		const allFiles = this.vault.getMarkdownFiles();
		const folderFiles = allFiles.filter(file => 
			file.path.startsWith(folderPath + '/') || file.path.startsWith(folderPath)
		);

		// 各ファイルをパース
		for (const file of folderFiles) {
			const item = this.parseFile(file);
			if (item) {
				project.items.set(file.path, item);
			}
		}

		// 親子関係を解決（バックリンクによる階層構築）
		this.resolveRelationships(project, folderPath);

		// WBS番号を生成
		this.assignWBSNumbers(project);

		// 階層レベルを計算
		this.calculateLevels(project);

		return project;
	}

	/**
	 * 単一ファイルの変更をプロジェクトに反映し、関係・WBS番号・レベルを更新する
	 */
	updateProjectWithFile(project: WBSProject, file: TFile, folderPath: string): void {
		// Re-parse the file and update project map
		const item = this.parseFile(file);

		if (item) {
			project.items.set(file.path, item);
		} else {
			// If parseFile returns null (no frontmatter), still ensure default exists
			project.items.delete(file.path);
		}

		// Clear child relationships and rebuild
		for (const itm of project.items.values()) {
			itm.childIds = [];
		}
		project.rootItemIds = [];

		// Re-resolve relationships and update numbering/levels
		this.resolveRelationships(project, folderPath);
		this.assignWBSNumbers(project);
		this.calculateLevels(project);
		project.lastUpdated = new Date();
	}

	/**
	 * 親子関係を解決（バックリンクによる階層構築）
	 * 
	 * ルール:
	 * - parentプロパティが空（未設定/空文字列）のタスクがルート
	 * - ルートタスクは必ず1つのみ
	 */
	private resolveRelationships(project: WBSProject, folderPath: string): void {
		const items = project.items;

		// まずすべての親子関係を解決
		for (const [itemPath, item] of items) {
			if (item.parentId) {
				// 親IDを実際のファイルパスに解決
				const resolvedParentPath = this.resolveParentPath(item.parentId, folderPath, items);
				
				if (resolvedParentPath && items.has(resolvedParentPath)) {
					item.parentId = resolvedParentPath;
					const parent = items.get(resolvedParentPath)!;
					if (!parent.childIds.includes(itemPath)) {
						parent.childIds.push(itemPath);
					}
				} else {
					// 親が見つからない場合はルートとして扱う
					item.parentId = null;
				}
			}
		}

		// ルートアイテムを特定（parentIdがnullのもの）
		for (const [itemPath, item] of items) {
			if (!item.parentId) {
				project.rootItemIds.push(itemPath);
			}
		}

		// ルートアイテムをソート（ファイル名順）
		project.rootItemIds.sort();
	}

	/**
	 * 親パスを解決
	 */
	private resolveParentPath(
		parentId: string, 
		folderPath: string, 
		items: Map<string, WBSItem>
	): string | null {
		// すでにフルパスの場合
		if (items.has(parentId)) {
			return parentId;
		}

		// ファイル名のみの場合、フォルダ内で検索
		const possiblePaths = [
			`${folderPath}/${parentId}.md`,
			`${folderPath}/${parentId}`,
			parentId + '.md'
		];

		for (const path of possiblePaths) {
			if (items.has(path)) {
				return path;
			}
		}

		// basename で検索
		for (const [itemPath] of items) {
			const basename = itemPath.split('/').pop()?.replace('.md', '');
			if (basename === parentId) {
				return itemPath;
			}
		}

		return null;
	}

	/**
	 * WBS番号を割り当て
	 */
	private assignWBSNumbers(project: WBSProject): void {
		const assignNumber = (itemIds: string[], prefix: string): void => {
			itemIds.forEach((itemId, index) => {
				const item = project.items.get(itemId);
				if (item) {
					// 明示的なWBS番号がない場合のみ自動生成
					if (!item.wbsNumber) {
						item.wbsNumber = prefix ? `${prefix}.${index + 1}` : String(index + 1);
					}
					// 子アイテムにも再帰的に割り当て
					if (item.childIds.length > 0) {
						// 子アイテムをソート
						item.childIds.sort();
						assignNumber(item.childIds, item.wbsNumber);
					}
				}
			});
		};

		assignNumber(project.rootItemIds, '');
	}

	/**
	 * 階層レベルを計算
	 */
	private calculateLevels(project: WBSProject): void {
		const calculateLevel = (itemId: string, level: number): void => {
			const item = project.items.get(itemId);
			if (item) {
				item.level = level;
				for (const childId of item.childIds) {
					calculateLevel(childId, level + 1);
				}
			}
		};

		for (const rootId of project.rootItemIds) {
			calculateLevel(rootId, 0);
		}
	}

	/**
	 * リンクターゲットを抽出（バックリンク解析）
	 */
	extractLinkTarget(link: string): string | null {
		if (!link) {
			return null;
		}

		// Wiki link: [[target]] or [[target|alias]]
		const wikiMatch = link.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/);
		if (wikiMatch) {
			return wikiMatch[1];
		}

		// Markdown link: [alias](target.md)
		const mdMatch = link.match(/\[[^\]]*\]\(([^)]+)\)/);
		if (mdMatch) {
			return mdMatch[1].replace(/\.md$/, '');
		}

		// Plain text
		return link;
	}

	/**
	 * ルートアイテムが正確に1つかどうかを検証
	 */
	validateSingleRoot(project: WBSProject): { valid: boolean; error?: string; errorFilePaths?: string[] } {
		if (project.rootItemIds.length === 0) {
			return {
				valid: false,
				error: 'ルートタスクが見つかりません。parentプロパティが空のタスクを1つ作成してください。'
			};
		}

		if (project.rootItemIds.length > 1) {
			const rootNames = project.rootItemIds
				.map(id => project.items.get(id)?.title || id)
				.join('、');
			return {
				valid: false,
				error: `ルートタスクは1つのみである必要があります。現在${project.rootItemIds.length}個あります: ${rootNames}`,
				errorFilePaths: project.rootItemIds
			};
		}

		return { valid: true };
	}
}
