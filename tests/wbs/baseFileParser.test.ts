import { BaseFileParser, BaseConfig, BaseView } from '../../src/wbs/baseFileParser';

describe('BaseFileParser', () => {
	let parser: BaseFileParser;

	beforeEach(() => {
		parser = new BaseFileParser();
	});

	describe('parse', () => {
		it('should parse basic .base file content', () => {
			const content = `views:
  - type: table
    name: Table
    order:
      - file.name
      - date
      - startTime
      - endTime`;

			const result = parser.parse(content);

			expect(result).not.toBeNull();
			expect(result!.views).toHaveLength(1);
			expect(result!.views[0].type).toBe('table');
			expect(result!.views[0].name).toBe('Table');
			expect(result!.views[0].order).toEqual(['file.name', 'date', 'startTime', 'endTime']);
		});

		it('should parse multiple views', () => {
			const content = `views:
  - type: table
    name: Table View
    order:
      - file.name
      - status
  - type: board
    name: Kanban
    groupBy: status`;

			const result = parser.parse(content);

			expect(result!.views).toHaveLength(2);
			expect(result!.views[0].type).toBe('table');
			expect(result!.views[1].type).toBe('board');
			expect(result!.views[1].groupBy).toBe('status');
		});

		it('should parse source folder configuration', () => {
			const content = `source: Projects/MyProject
views:
  - type: table
    name: Table`;

			const result = parser.parse(content);

			expect(result!.source).toBe('Projects/MyProject');
		});

		it('should return null for empty content', () => {
			const result = parser.parse('');
			expect(result).toBeNull();
		});

		it('should handle missing views gracefully', () => {
			const content = `source: Projects`;

			const result = parser.parse(content);

			expect(result).not.toBeNull();
			expect(result!.views).toEqual([]);
		});
	});

	describe('getColumns', () => {
		it('should extract columns from first table view', () => {
			const content = `views:
  - type: table
    name: Table
    order:
      - file.name
      - status
      - assignee
      - due-date`;

			const config = parser.parse(content);
			const columns = parser.getColumns(config!);

			expect(columns).toContain('file.name');
			expect(columns).toContain('status');
			expect(columns).toContain('assignee');
			expect(columns).toContain('due-date');
		});

		it('should return default columns if no table view', () => {
			const content = `views:
  - type: board
    name: Kanban`;

			const config = parser.parse(content);
			const columns = parser.getColumns(config!);

			expect(columns).toContain('file.name');
			expect(columns).toContain('status');
		});
	});

	describe('mapToWBSColumns', () => {
		it('should map base columns to WBS columns', () => {
			const baseColumns = ['file.name', 'status', 'assignee', 'due-date', 'progress'];
			const wbsColumns = parser.mapToWBSColumns(baseColumns);

			expect(wbsColumns).toContain('title');
			expect(wbsColumns).toContain('status');
			expect(wbsColumns).toContain('assignee');
			expect(wbsColumns).toContain('dueDate');
			expect(wbsColumns).toContain('progress');
		});

		it('should always include wbs column first', () => {
			const baseColumns = ['status', 'assignee'];
			const wbsColumns = parser.mapToWBSColumns(baseColumns);

			expect(wbsColumns[0]).toBe('wbs');
		});

		it('should map file.name to title', () => {
			const wbsColumns = parser.mapToWBSColumns(['file.name']);
			expect(wbsColumns).toContain('title');
		});
	});
});
