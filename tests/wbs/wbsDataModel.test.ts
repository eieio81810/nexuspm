import {
	WBSItem,
	WBSStatus,
	normalizeStatus,
	calculateProgress,
	generateWBSNumber,
	createDefaultWBSItem
} from '../../src/wbs/wbsDataModel';

describe('WBS Data Model', () => {
	describe('normalizeStatus', () => {
		it('should return not-started for undefined', () => {
			expect(normalizeStatus(undefined)).toBe('not-started');
		});

		it('should return not-started for empty string', () => {
			expect(normalizeStatus('')).toBe('not-started');
		});

		describe('English status values', () => {
			it('should normalize completed variants', () => {
				expect(normalizeStatus('completed')).toBe('completed');
				expect(normalizeStatus('done')).toBe('completed');
				expect(normalizeStatus('complete')).toBe('completed');
				expect(normalizeStatus('COMPLETED')).toBe('completed');
			});

			it('should normalize in-progress variants', () => {
				expect(normalizeStatus('in-progress')).toBe('in-progress');
				expect(normalizeStatus('inprogress')).toBe('in-progress');
				expect(normalizeStatus('in progress')).toBe('in-progress');
				expect(normalizeStatus('doing')).toBe('in-progress');
			});

			it('should normalize blocked variants', () => {
				expect(normalizeStatus('blocked')).toBe('blocked');
				expect(normalizeStatus('hold')).toBe('blocked');
				expect(normalizeStatus('on hold')).toBe('blocked');
			});

			it('should normalize cancelled variants', () => {
				expect(normalizeStatus('cancelled')).toBe('cancelled');
				expect(normalizeStatus('canceled')).toBe('cancelled');
			});

			it('should normalize not-started variants', () => {
				expect(normalizeStatus('not-started')).toBe('not-started');
				expect(normalizeStatus('todo')).toBe('not-started');
				expect(normalizeStatus('to do')).toBe('not-started');
			});
		});

		describe('Japanese status values', () => {
			it('should normalize completed variants', () => {
				expect(normalizeStatus('完了')).toBe('completed');
				expect(normalizeStatus('済')).toBe('completed');
				expect(normalizeStatus('済み')).toBe('completed');
			});

			it('should normalize in-progress variants', () => {
				expect(normalizeStatus('進行中')).toBe('in-progress');
				expect(normalizeStatus('作業中')).toBe('in-progress');
				expect(normalizeStatus('対応中')).toBe('in-progress');
			});

			it('should normalize blocked variants', () => {
				expect(normalizeStatus('ブロック')).toBe('blocked');
				expect(normalizeStatus('ブロック中')).toBe('blocked');
				expect(normalizeStatus('保留')).toBe('blocked');
				expect(normalizeStatus('待ち')).toBe('blocked');
			});

			it('should normalize cancelled variants', () => {
				expect(normalizeStatus('キャンセル')).toBe('cancelled');
				expect(normalizeStatus('中止')).toBe('cancelled');
				expect(normalizeStatus('取消')).toBe('cancelled');
			});

			it('should normalize not-started variants', () => {
				expect(normalizeStatus('未着手')).toBe('not-started');
				expect(normalizeStatus('未開始')).toBe('not-started');
				expect(normalizeStatus('予定')).toBe('not-started');
			});
		});
	});

	describe('calculateProgress', () => {
		it('should return 100 for completed item without children', () => {
			const items = new Map<string, WBSItem>();
			const item = createDefaultWBSItem('task1', 'Task 1');
			item.status = 'completed';
			items.set('task1', item);

			expect(calculateProgress(item, items)).toBe(100);
		});

		it('should return 50 for in-progress item without children', () => {
			const items = new Map<string, WBSItem>();
			const item = createDefaultWBSItem('task1', 'Task 1');
			item.status = 'in-progress';
			items.set('task1', item);

			expect(calculateProgress(item, items)).toBe(50);
		});

		it('should return 0 for not-started item without children', () => {
			const items = new Map<string, WBSItem>();
			const item = createDefaultWBSItem('task1', 'Task 1');
			item.status = 'not-started';
			items.set('task1', item);

			expect(calculateProgress(item, items)).toBe(0);
		});

		it('should return explicit progress value if set', () => {
			const items = new Map<string, WBSItem>();
			const item = createDefaultWBSItem('task1', 'Task 1');
			item.status = 'in-progress';
			item.progress = 75;
			items.set('task1', item);

			expect(calculateProgress(item, items)).toBe(75);
		});

		it('should calculate average progress from children', () => {
			const items = new Map<string, WBSItem>();
			
			const parent = createDefaultWBSItem('parent', 'Parent');
			parent.childIds = ['child1', 'child2'];
			
			const child1 = createDefaultWBSItem('child1', 'Child 1');
			child1.parentId = 'parent';
			child1.status = 'completed'; // 100%
			
			const child2 = createDefaultWBSItem('child2', 'Child 2');
			child2.parentId = 'parent';
			child2.status = 'not-started'; // 0%
			
			items.set('parent', parent);
			items.set('child1', child1);
			items.set('child2', child2);

			expect(calculateProgress(parent, items)).toBe(50); // (100 + 0) / 2
		});

		it('should calculate nested progress recursively', () => {
			const items = new Map<string, WBSItem>();
			
			const grandparent = createDefaultWBSItem('gp', 'Grandparent');
			grandparent.childIds = ['parent'];
			
			const parent = createDefaultWBSItem('parent', 'Parent');
			parent.parentId = 'gp';
			parent.childIds = ['child1', 'child2'];
			
			const child1 = createDefaultWBSItem('child1', 'Child 1');
			child1.parentId = 'parent';
			child1.status = 'completed'; // 100%
			
			const child2 = createDefaultWBSItem('child2', 'Child 2');
			child2.parentId = 'parent';
			child2.status = 'completed'; // 100%
			
			items.set('gp', grandparent);
			items.set('parent', parent);
			items.set('child1', child1);
			items.set('child2', child2);

			expect(calculateProgress(parent, items)).toBe(100);
			expect(calculateProgress(grandparent, items)).toBe(100);
		});
	});

	describe('generateWBSNumber', () => {
		it('should return simple number for root item', () => {
			const items = new Map<string, WBSItem>();
			const item = createDefaultWBSItem('task1', 'Task 1');
			items.set('task1', item);

			expect(generateWBSNumber(item, items, 0)).toBe('1');
			expect(generateWBSNumber(item, items, 2)).toBe('3');
		});

		it('should return hierarchical number for child item', () => {
			const items = new Map<string, WBSItem>();
			
			const parent = createDefaultWBSItem('parent', 'Parent');
			parent.wbsNumber = '1';
			
			const child = createDefaultWBSItem('child', 'Child');
			child.parentId = 'parent';
			
			items.set('parent', parent);
			items.set('child', child);

			expect(generateWBSNumber(child, items, 0)).toBe('1.1');
			expect(generateWBSNumber(child, items, 1)).toBe('1.2');
		});

		it('should handle deep nesting', () => {
			const items = new Map<string, WBSItem>();
			
			const level1 = createDefaultWBSItem('l1', 'Level 1');
			level1.wbsNumber = '2';
			
			const level2 = createDefaultWBSItem('l2', 'Level 2');
			level2.parentId = 'l1';
			level2.wbsNumber = '2.3';
			
			const level3 = createDefaultWBSItem('l3', 'Level 3');
			level3.parentId = 'l2';
			
			items.set('l1', level1);
			items.set('l2', level2);
			items.set('l3', level3);

			expect(generateWBSNumber(level3, items, 0)).toBe('2.3.1');
		});
	});

	describe('createDefaultWBSItem', () => {
		it('should create item with correct defaults', () => {
			const item = createDefaultWBSItem('test.md', 'Test Task');

			expect(item.id).toBe('test.md');
			expect(item.title).toBe('Test Task');
			expect(item.parentId).toBeNull();
			expect(item.childIds).toEqual([]);
			expect(item.wbsNumber).toBe('');
			expect(item.status).toBe('not-started');
			expect(item.assignee).toBeNull();
			expect(item.startDate).toBeNull();
			expect(item.dueDate).toBeNull();
			expect(item.progress).toBe(0);
			expect(item.estimatedHours).toBeNull();
			expect(item.actualHours).toBeNull();
			expect(item.priority).toBeNull();
			expect(item.tags).toEqual([]);
			expect(item.description).toBeNull();
			expect(item.level).toBe(0);
			expect(item.isExpanded).toBe(true);
		});
	});
});
