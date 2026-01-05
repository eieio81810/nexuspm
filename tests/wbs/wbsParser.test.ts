import { WBSParser, WBSParserOptions } from '../../src/wbs/wbsParser';
import { WBSItem, WBSProject, DEFAULT_PROPERTY_MAPPING } from '../../src/wbs/wbsDataModel';
import { TFile, MetadataCache, Vault, CachedMetadata } from 'obsidian';

// Mock types for frontmatter
interface MockFrontmatter {
	parent?: string;
	status?: string;
	assignee?: string;
	'start-date'?: string;
	'due-date'?: string;
	progress?: number;
	'estimated-hours'?: number;
	'actual-hours'?: number;
	priority?: number;
	tags?: string[];
}

describe('WBSParser', () => {
	let mockMetadataCache: jest.Mocked<MetadataCache>;
	let mockVault: jest.Mocked<Vault>;
	let parser: WBSParser;

	beforeEach(() => {
		mockMetadataCache = {
			getFileCache: jest.fn(),
		} as unknown as jest.Mocked<MetadataCache>;

		mockVault = {
			read: jest.fn(),
			getMarkdownFiles: jest.fn(),
			getAbstractFileByPath: jest.fn(),
		} as unknown as jest.Mocked<Vault>;

		parser = new WBSParser(mockMetadataCache, mockVault);
	});

	describe('parseFile', () => {
		it('should parse frontmatter properties correctly', async () => {
			const mockFile = { 
				path: 'tasks/task1.md', 
				basename: 'task1',
				extension: 'md'
			} as TFile;

			const frontmatter: MockFrontmatter = {
				status: 'in-progress',
				assignee: 'John',
				'start-date': '2024-01-01',
				'due-date': '2024-01-15',
				progress: 50,
				'estimated-hours': 8,
				'actual-hours': 4,
				priority: 1,
				tags: ['backend', 'urgent']
			};

			mockMetadataCache.getFileCache.mockReturnValue({
				frontmatter: frontmatter as unknown as CachedMetadata['frontmatter'],
				headings: [{ level: 1, heading: 'Task Title', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } } }]
			} as CachedMetadata);

			const result = await parser.parseFile(mockFile);

			expect(result).not.toBeNull();
			expect(result!.id).toBe('tasks/task1.md');
			expect(result!.title).toBe('Task Title');
			expect(result!.status).toBe('in-progress');
			expect(result!.assignee).toBe('John');
			expect(result!.startDate).toBe('2024-01-01');
			expect(result!.dueDate).toBe('2024-01-15');
			expect(result!.progress).toBe(50);
			expect(result!.estimatedHours).toBe(8);
			expect(result!.actualHours).toBe(4);
			expect(result!.priority).toBe(1);
			expect(result!.tags).toEqual(['backend', 'urgent']);
		});

		it('should use basename when no H1 heading exists', async () => {
			const mockFile = { 
				path: 'tasks/my-task.md', 
				basename: 'my-task',
				extension: 'md'
			} as TFile;

			mockMetadataCache.getFileCache.mockReturnValue({
				frontmatter: {} as CachedMetadata['frontmatter'],
				headings: []
			} as CachedMetadata);

			const result = await parser.parseFile(mockFile);

			expect(result!.title).toBe('my-task');
		});

		it('should set parent from frontmatter link', async () => {
			const mockFile = { 
				path: 'tasks/subtask.md', 
				basename: 'subtask',
				extension: 'md'
			} as TFile;

			mockMetadataCache.getFileCache.mockReturnValue({
				frontmatter: {
					parent: '[[parent-task]]'
				} as unknown as CachedMetadata['frontmatter'],
				headings: []
			} as CachedMetadata);

			const result = await parser.parseFile(mockFile);

			expect(result!.parentId).toBe('parent-task');
		});

		it('should handle missing frontmatter gracefully', async () => {
			const mockFile = { 
				path: 'tasks/simple.md', 
				basename: 'simple',
				extension: 'md'
			} as TFile;

			mockMetadataCache.getFileCache.mockReturnValue(null);

			const result = await parser.parseFile(mockFile);

			expect(result!.id).toBe('tasks/simple.md');
			expect(result!.title).toBe('simple');
			expect(result!.status).toBe('not-started');
			expect(result!.parentId).toBeNull();
		});
	});

	describe('parseFolder', () => {
		it('should parse all markdown files in folder', async () => {
			const mockFiles = [
				{ path: 'project/task1.md', basename: 'task1', extension: 'md' },
				{ path: 'project/task2.md', basename: 'task2', extension: 'md' },
				{ path: 'other/unrelated.md', basename: 'unrelated', extension: 'md' }
			] as TFile[];

			mockVault.getMarkdownFiles.mockReturnValue(mockFiles);
			mockMetadataCache.getFileCache.mockReturnValue({
				frontmatter: {} as CachedMetadata['frontmatter'],
				headings: []
			} as CachedMetadata);

			const result = await parser.parseFolder('project');

			expect(result.items.size).toBe(2);
			expect(result.items.has('project/task1.md')).toBe(true);
			expect(result.items.has('project/task2.md')).toBe(true);
			expect(result.items.has('other/unrelated.md')).toBe(false);
		});

		it('should build parent-child relationships', async () => {
			const mockFiles = [
				{ path: 'project/parent.md', basename: 'parent', extension: 'md' },
				{ path: 'project/child.md', basename: 'child', extension: 'md' }
			] as TFile[];

			mockVault.getMarkdownFiles.mockReturnValue(mockFiles);
			mockMetadataCache.getFileCache.mockImplementation((file: TFile) => {
				if (file.basename === 'child') {
					return {
						frontmatter: { parent: '[[parent]]' } as unknown as CachedMetadata['frontmatter'],
						headings: []
					} as CachedMetadata;
				}
				return {
					frontmatter: {} as CachedMetadata['frontmatter'],
					headings: []
				} as CachedMetadata;
			});

			// Mock file resolution for parent link
			mockVault.getAbstractFileByPath.mockImplementation((path: string) => {
				if (path === 'project/parent.md') {
					return mockFiles[0];
				}
				return null;
			});

			const result = await parser.parseFolder('project');

			const parentItem = result.items.get('project/parent.md');
			const childItem = result.items.get('project/child.md');

			expect(parentItem!.childIds).toContain('project/child.md');
			expect(childItem!.parentId).toBe('project/parent.md');
		});

		it('should identify root items', async () => {
			const mockFiles = [
				{ path: 'project/root1.md', basename: 'root1', extension: 'md' },
				{ path: 'project/root2.md', basename: 'root2', extension: 'md' },
				{ path: 'project/child.md', basename: 'child', extension: 'md' }
			] as TFile[];

			mockVault.getMarkdownFiles.mockReturnValue(mockFiles);
			mockMetadataCache.getFileCache.mockImplementation((file: TFile) => {
				if (file.basename === 'child') {
					return {
						frontmatter: { parent: '[[root1]]' } as unknown as CachedMetadata['frontmatter'],
						headings: []
					} as CachedMetadata;
				}
				return {
					frontmatter: {} as CachedMetadata['frontmatter'],
					headings: []
				} as CachedMetadata;
			});

			mockVault.getAbstractFileByPath.mockImplementation((path: string) => {
				if (path === 'project/root1.md') return mockFiles[0];
				return null;
			});

			const result = await parser.parseFolder('project');

			expect(result.rootItemIds).toHaveLength(2);
			expect(result.rootItemIds).toContain('project/root1.md');
			expect(result.rootItemIds).toContain('project/root2.md');
			expect(result.rootItemIds).not.toContain('project/child.md');
		});

		it('should assign WBS numbers correctly', async () => {
			const mockFiles = [
				{ path: 'project/task1.md', basename: 'task1', extension: 'md' },
				{ path: 'project/task2.md', basename: 'task2', extension: 'md' },
				{ path: 'project/subtask1.md', basename: 'subtask1', extension: 'md' }
			] as TFile[];

			mockVault.getMarkdownFiles.mockReturnValue(mockFiles);
			mockMetadataCache.getFileCache.mockImplementation((file: TFile) => {
				if (file.basename === 'subtask1') {
					return {
						frontmatter: { parent: '[[task1]]' } as unknown as CachedMetadata['frontmatter'],
						headings: []
					} as CachedMetadata;
				}
				return {
					frontmatter: {} as CachedMetadata['frontmatter'],
					headings: []
				} as CachedMetadata;
			});

			mockVault.getAbstractFileByPath.mockImplementation((path: string) => {
				if (path === 'project/task1.md') return mockFiles[0];
				return null;
			});

			const result = await parser.parseFolder('project');

			const task1 = result.items.get('project/task1.md');
			const task2 = result.items.get('project/task2.md');
			const subtask1 = result.items.get('project/subtask1.md');

			// WBS numbers should be assigned
			expect(task1!.wbsNumber).toMatch(/^\d+$/);
			expect(task2!.wbsNumber).toMatch(/^\d+$/);
			expect(subtask1!.wbsNumber).toMatch(/^\d+\.\d+$/);
		});

		it('should calculate hierarchy levels', async () => {
			const mockFiles = [
				{ path: 'project/root.md', basename: 'root', extension: 'md' },
				{ path: 'project/child.md', basename: 'child', extension: 'md' },
				{ path: 'project/grandchild.md', basename: 'grandchild', extension: 'md' }
			] as TFile[];

			mockVault.getMarkdownFiles.mockReturnValue(mockFiles);
			mockMetadataCache.getFileCache.mockImplementation((file: TFile) => {
				if (file.basename === 'child') {
					return {
						frontmatter: { parent: '[[root]]' } as unknown as CachedMetadata['frontmatter'],
						headings: []
					} as CachedMetadata;
				}
				if (file.basename === 'grandchild') {
					return {
						frontmatter: { parent: '[[child]]' } as unknown as CachedMetadata['frontmatter'],
						headings: []
					} as CachedMetadata;
				}
				return {
					frontmatter: {} as CachedMetadata['frontmatter'],
					headings: []
				} as CachedMetadata;
			});

			mockVault.getAbstractFileByPath.mockImplementation((path: string) => {
				if (path === 'project/root.md') return mockFiles[0];
				if (path === 'project/child.md') return mockFiles[1];
				return null;
			});

			const result = await parser.parseFolder('project');

			expect(result.items.get('project/root.md')!.level).toBe(0);
			expect(result.items.get('project/child.md')!.level).toBe(1);
			expect(result.items.get('project/grandchild.md')!.level).toBe(2);
		});
	});

	describe('extractLinkTarget', () => {
		it('should extract target from wiki link', () => {
			expect(parser.extractLinkTarget('[[target]]')).toBe('target');
			expect(parser.extractLinkTarget('[[folder/target]]')).toBe('folder/target');
			expect(parser.extractLinkTarget('[[target|alias]]')).toBe('target');
		});

		it('should extract target from markdown link', () => {
			expect(parser.extractLinkTarget('[alias](target.md)')).toBe('target');
			expect(parser.extractLinkTarget('[alias](folder/target.md)')).toBe('folder/target');
		});

		it('should handle plain text as-is', () => {
			expect(parser.extractLinkTarget('plain-text')).toBe('plain-text');
			expect(parser.extractLinkTarget('Some Task Name')).toBe('Some Task Name');
		});

		it('should return null for empty input', () => {
			expect(parser.extractLinkTarget('')).toBeNull();
			expect(parser.extractLinkTarget(undefined as unknown as string)).toBeNull();
		});
	});
});
