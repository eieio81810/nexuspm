import { WBSRenderer, WBSRenderOptions } from '../../src/wbs/wbsRenderer';
import { WBSItem, WBSProject, createDefaultWBSItem } from '../../src/wbs/wbsDataModel';

describe('WBSRenderer', () => {
	let renderer: WBSRenderer;

	beforeEach(() => {
		renderer = new WBSRenderer();
	});

	describe('renderTable', () => {
		it('should render empty state when no items', () => {
			const project: WBSProject = {
				id: 'test-project',
				name: 'Test Project',
				rootItemIds: [],
				items: new Map(),
				lastUpdated: new Date()
			};

			const html = renderer.renderTable(project);

			expect(html).toContain('wbs-empty');
			expect(html).toContain('タスクがありません');
		});

		it('should render table with header row', () => {
			const project = createTestProject();
			const html = renderer.renderTable(project);

			expect(html).toContain('<table');
			expect(html).toContain('WBS');
			expect(html).toContain('タスク名');
			expect(html).toContain('ステータス');
			expect(html).toContain('担当者');
			expect(html).toContain('期限');
			expect(html).toContain('進捗');
		});

		it('should render items with correct indentation', () => {
			const project = createHierarchicalProject();
			const html = renderer.renderTable(project);

			// Check that child has indentation class
			expect(html).toContain('level-0');
			expect(html).toContain('level-1');
		});

		it('should render status with color styling', () => {
			const project = createTestProject();
			const item = project.items.get('task1')!;
			item.status = 'in-progress';
			
			const html = renderer.renderTable(project);

			expect(html).toContain('status-in-progress');
			expect(html).toContain('進行中');
		});

		it('should render progress bar', () => {
			const project = createTestProject();
			const item = project.items.get('task1')!;
			item.progress = 75;
			
			const html = renderer.renderTable(project);

			expect(html).toContain('progress-bar');
			expect(html).toContain('75%');
		});

		it('should render assignee when present', () => {
			const project = createTestProject();
			const item = project.items.get('task1')!;
			item.assignee = 'Alice';
			
			const html = renderer.renderTable(project);

			expect(html).toContain('Alice');
		});

		it('should render due date when present', () => {
			const project = createTestProject();
			const item = project.items.get('task1')!;
			item.dueDate = '2024-12-31';
			
			const html = renderer.renderTable(project);

			expect(html).toContain('2024-12-31');
		});

		it('should add expand/collapse button for items with children', () => {
			const project = createHierarchicalProject();
			const html = renderer.renderTable(project);

			expect(html).toContain('expand-btn');
			expect(html).toContain('data-item-id="parent"');
		});

		it('should not add expand button for leaf items', () => {
			const project = createTestProject();
			const html = renderer.renderTable(project);

			// Single item without children should not have expand button
			expect(html).not.toContain('expand-btn');
		});
	});

	describe('renderItem', () => {
		it('should render WBS number', () => {
			const item = createDefaultWBSItem('task1', 'Task 1');
			item.wbsNumber = '1.2.3';
			
			const html = renderer.renderItem(item, new Map());

			expect(html).toContain('1.2.3');
		});

		it('should render all status variants correctly', () => {
			const statusTests = [
				{ status: 'not-started', label: '未着手', cssClass: 'status-not-started' },
				{ status: 'in-progress', label: '進行中', cssClass: 'status-in-progress' },
				{ status: 'completed', label: '完了', cssClass: 'status-completed' },
				{ status: 'blocked', label: 'ブロック中', cssClass: 'status-blocked' },
				{ status: 'cancelled', label: 'キャンセル', cssClass: 'status-cancelled' }
			];

			for (const test of statusTests) {
				const item = createDefaultWBSItem('task', 'Task');
				item.status = test.status as any;
				
				const html = renderer.renderItem(item, new Map());

				expect(html).toContain(test.cssClass);
				expect(html).toContain(test.label);
			}
		});

		it('should render clickable task title with file path', () => {
			const item = createDefaultWBSItem('folder/task.md', 'My Task');
			
			const html = renderer.renderItem(item, new Map());

			expect(html).toContain('data-file-path="folder/task.md"');
			expect(html).toContain('My Task');
		});

		it('should calculate and display rolled-up progress for parent items', () => {
			const items = new Map<string, WBSItem>();
			
			const parent = createDefaultWBSItem('parent', 'Parent');
			parent.childIds = ['child1', 'child2'];
			
			const child1 = createDefaultWBSItem('child1', 'Child 1');
			child1.status = 'completed';
			
			const child2 = createDefaultWBSItem('child2', 'Child 2');
			child2.status = 'not-started';
			
			items.set('parent', parent);
			items.set('child1', child1);
			items.set('child2', child2);

			const html = renderer.renderItem(parent, items);

			expect(html).toContain('50%');
		});
	});

	describe('renderProgressBar', () => {
		it('should render 0% progress correctly', () => {
			const html = renderer.renderProgressBar(0);

			expect(html).toContain('width: 0%');
			expect(html).toContain('0%');
		});

		it('should render 100% progress correctly', () => {
			const html = renderer.renderProgressBar(100);

			expect(html).toContain('width: 100%');
			expect(html).toContain('100%');
		});

		it('should render intermediate progress correctly', () => {
			const html = renderer.renderProgressBar(42);

			expect(html).toContain('width: 42%');
			expect(html).toContain('42%');
		});

		it('should apply correct color class based on progress', () => {
			expect(renderer.renderProgressBar(25)).toContain('progress-low');
			expect(renderer.renderProgressBar(50)).toContain('progress-medium');
			expect(renderer.renderProgressBar(75)).toContain('progress-high');
			expect(renderer.renderProgressBar(100)).toContain('progress-complete');
		});
	});

	describe('getVisibleItems', () => {
		it('should return all items when all expanded', () => {
			const project = createHierarchicalProject();
			
			const visible = renderer.getVisibleItems(project);

			expect(visible).toHaveLength(2);
		});

		it('should hide children when parent is collapsed', () => {
			const project = createHierarchicalProject();
			const parent = project.items.get('parent')!;
			parent.isExpanded = false;

			const visible = renderer.getVisibleItems(project);

			expect(visible).toHaveLength(1);
			expect(visible[0].id).toBe('parent');
		});
	});

	describe('Custom columns', () => {
		it('should render custom columns when configured', () => {
			const customRenderer = new WBSRenderer({
				columns: ['wbs', 'title', 'status', 'priority', 'estimatedHours']
			});

			const project = createTestProject();
			const item = project.items.get('task1')!;
			item.priority = 1;
			item.estimatedHours = 8;

			const html = customRenderer.renderTable(project);

			expect(html).toContain('優先度');
			expect(html).toContain('見積時間');
		});

		it('should hide columns not in configuration', () => {
			const customRenderer = new WBSRenderer({
				columns: ['wbs', 'title', 'status']
			});

			const project = createTestProject();
			const html = customRenderer.renderTable(project);

			expect(html).not.toContain('担当者');
			expect(html).not.toContain('期限');
		});
	});
});

// Helper functions

function createTestProject(): WBSProject {
	const items = new Map<string, WBSItem>();
	const item = createDefaultWBSItem('task1', 'Task 1');
	item.wbsNumber = '1';
	items.set('task1', item);

	return {
		id: 'test-project',
		name: 'Test Project',
		rootItemIds: ['task1'],
		items,
		lastUpdated: new Date()
	};
}

function createHierarchicalProject(): WBSProject {
	const items = new Map<string, WBSItem>();
	
	const parent = createDefaultWBSItem('parent', 'Parent Task');
	parent.wbsNumber = '1';
	parent.childIds = ['child'];
	parent.isExpanded = true;
	
	const child = createDefaultWBSItem('child', 'Child Task');
	child.wbsNumber = '1.1';
	child.parentId = 'parent';
	child.level = 1;
	
	items.set('parent', parent);
	items.set('child', child);

	return {
		id: 'test-project',
		name: 'Test Project',
		rootItemIds: ['parent'],
		items,
		lastUpdated: new Date()
	};
}
