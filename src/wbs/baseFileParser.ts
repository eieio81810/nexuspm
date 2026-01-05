/**
 * Obsidian Bases .base ファイルパーサー
 * 
 * .baseファイルはYAML形式でビュー定義、フィルタ、ソート設定を含む
 */

/**
 * フィルタ条件
 */
export interface BaseFilter {
	property: string;
	operator: 'is' | 'is-not' | 'contains' | 'does-not-contain' | 'is-empty' | 'is-not-empty';
	value?: string | number | boolean;
}

/**
 * ソート設定
 */
export interface BaseSort {
	property: string;
	direction: 'asc' | 'desc';
}

/**
 * ビュー定義
 */
export interface BaseView {
	type: 'table' | 'board' | 'gallery' | 'list';
	name: string;
	order?: string[];
	groupBy?: string;
	sort?: BaseSort[];
	filter?: BaseFilter[];
}

/**
 * .baseファイルの設定
 */
export interface BaseConfig {
	source?: string;
	filter?: BaseFilter[];
	views: BaseView[];
}

/**
 * .baseファイルをパースするクラス
 */
export class BaseFileParser {
	/**
	 * .baseファイルの内容をパースしてBaseConfigを返す
	 */
	parse(content: string): BaseConfig | null {
		if (!content || content.trim() === '') {
			return null;
		}

		try {
			const config = this.parseYaml(content);
			if (!config || typeof config !== 'object') {
				return null;
			}

			// 最低限viewsキーが存在するか、他の有効なキーがあるかチェック
			const hasValidKeys = 'views' in config || 'source' in config || 'filter' in config;
			if (!hasValidKeys) {
				return null;
			}

			return {
				source: config.source as string | undefined,
				filter: this.parseFilters(config.filter),
				views: this.parseViews(config.views)
			};
		} catch (error) {
			console.error('Base file parse error:', error);
			return null;
		}
	}

	/**
	 * シンプルなYAMLパーサー（外部ライブラリなし）
	 */
	private parseYaml(content: string): Record<string, unknown> {
		const result: Record<string, unknown> = {};
		const lines = content.split('\n');
		
		interface StackItem {
			obj: Record<string, unknown> | unknown[];
			indent: number;
			key?: string;
		}
		
		const stack: StackItem[] = [{ obj: result, indent: -1 }];
		
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const trimmed = line.trim();
			
			// 空行やコメントをスキップ
			if (trimmed === '' || trimmed.startsWith('#')) continue;
			
			const indent = line.search(/\S/);
			
			// スタックを適切なレベルまで戻す
			while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
				stack.pop();
			}
			
			const current = stack[stack.length - 1];
			
			// 配列要素
			if (trimmed.startsWith('- ')) {
				const itemContent = trimmed.substring(2).trim();
				
				// 現在のオブジェクトの最後のキーの配列に追加
				if (!Array.isArray(current.obj) && current.key) {
					const arr = (current.obj as Record<string, unknown>)[current.key];
					if (Array.isArray(arr)) {
						if (itemContent.includes(':')) {
							// オブジェクト形式の配列要素
							const obj: Record<string, unknown> = {};
							const colonIdx = itemContent.indexOf(':');
							const key = itemContent.substring(0, colonIdx).trim();
							const val = itemContent.substring(colonIdx + 1).trim();
							obj[key] = val || [];
							arr.push(obj);
							stack.push({ obj: obj, indent: indent, key: key });
						} else {
							// 単純な値
							arr.push(itemContent);
						}
					}
				} else if (Array.isArray(current.obj)) {
					if (itemContent.includes(':')) {
						const obj: Record<string, unknown> = {};
						const colonIdx = itemContent.indexOf(':');
						const key = itemContent.substring(0, colonIdx).trim();
						const val = itemContent.substring(colonIdx + 1).trim();
						obj[key] = val || [];
						current.obj.push(obj);
						stack.push({ obj: obj, indent: indent, key: key });
					} else {
						current.obj.push(itemContent);
					}
				}
				continue;
			}
			
			// キー:値 ペア
			if (trimmed.includes(':')) {
				const colonIdx = trimmed.indexOf(':');
				const key = trimmed.substring(0, colonIdx).trim();
				const val = trimmed.substring(colonIdx + 1).trim();
				
				if (!Array.isArray(current.obj)) {
					const obj = current.obj as Record<string, unknown>;
					if (val === '' || val === '[]') {
						// 空の配列またはネストされたオブジェクト
						obj[key] = [];
						stack.push({ obj: obj, indent: indent, key: key });
					} else {
						obj[key] = val;
					}
				}
			}
		}
		
		return result;
	}

	/**
	 * フィルタ設定をパース
	 */
	private parseFilters(filters: unknown): BaseFilter[] | undefined {
		if (!Array.isArray(filters)) return undefined;
		if (filters.length === 0) return undefined;

		return filters.map(f => {
			if (typeof f !== 'object' || f === null) {
				return null;
			}
			const obj = f as Record<string, unknown>;
			return {
				property: String(obj.property || ''),
				operator: (obj.operator || 'is') as BaseFilter['operator'],
				value: obj.value
			};
		}).filter((f): f is BaseFilter => f !== null && f.property !== '');
	}

	/**
	 * ビュー設定をパース
	 */
	private parseViews(views: unknown): BaseView[] {
		if (!Array.isArray(views)) return [];

		return views.map(v => {
			if (typeof v !== 'object' || v === null) {
				return null;
			}
			const obj = v as Record<string, unknown>;
			
			const view: BaseView = {
				type: (obj.type || 'table') as BaseView['type'],
				name: String(obj.name || 'View')
			};

			if (Array.isArray(obj.order)) {
				view.order = obj.order.map(String);
			}

			if (obj.groupBy) {
				view.groupBy = String(obj.groupBy);
			}

			if (Array.isArray(obj.sort)) {
				view.sort = obj.sort.map((s: unknown) => {
					const sortObj = s as Record<string, string>;
					return {
						property: String(sortObj.property || ''),
						direction: (sortObj.direction || 'asc') as 'asc' | 'desc'
					};
				}).filter(s => s.property !== '');
			}

			if (Array.isArray(obj.filter)) {
				view.filter = this.parseFilters(obj.filter);
			}

			return view;
		}).filter((v): v is BaseView => v !== null);
	}

	/**
	 * 設定からカラム一覧を取得
	 */
	getColumns(config: BaseConfig): string[] {
		// 最初のテーブルビューからカラムを取得
		const tableView = config.views.find(v => v.type === 'table');
		
		if (tableView?.order && tableView.order.length > 0) {
			return tableView.order;
		}

		// デフォルトカラム
		return ['file.name', 'status', 'assignee', 'due-date', 'progress'];
	}

	/**
	 * Basesのカラム名をWBSカラム名にマッピング
	 */
	mapToWBSColumns(baseColumns: string[]): string[] {
		const columnMap: Record<string, string> = {
			'file.name': 'title',
			'file.path': 'title',
			'name': 'title',
			'title': 'title',
			'status': 'status',
			'assignee': 'assignee',
			'start-date': 'startDate',
			'startDate': 'startDate',
			'due-date': 'dueDate',
			'dueDate': 'dueDate',
			'progress': 'progress',
			'priority': 'priority',
			'estimated-hours': 'estimatedHours',
			'estimatedHours': 'estimatedHours',
			'actual-hours': 'actualHours',
			'actualHours': 'actualHours',
			'tags': 'tags'
		};

		const result: string[] = ['wbs']; // WBS番号は常に最初

		for (const col of baseColumns) {
			const mapped = columnMap[col];
			if (mapped && !result.includes(mapped)) {
				result.push(mapped);
			}
		}

		// 最低限のカラムを確保
		if (!result.includes('title')) {
			result.splice(1, 0, 'title');
		}

		return result;
	}
}
