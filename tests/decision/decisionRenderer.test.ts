/**
 * Decision Renderer Tests
 */
import { DecisionRenderer } from '../../src/decision/decisionRenderer';
import {
	DecisionProject,
	DecisionOption,
	Decision,
	Risk,
	Criterion,
	createEmptyProject
} from '../../src/decision/decisionDataModel';

describe('DecisionRenderer', () => {
	let renderer: DecisionRenderer;

	beforeEach(() => {
		renderer = new DecisionRenderer();
	});

	describe('renderOptionsTable', () => {
		it('should render options with scores', () => {
			const criteria: Criterion[] = [
				{ key: 'cost', label: 'コスト', weight: 3 },
				{ key: 'quality', label: '品質', weight: 5 }
			];
			const options: DecisionOption[] = [
				{
					id: 'opt1',
					title: '候補A',
					parentId: null,
					status: 'in-progress',
					scores: { cost: 4, quality: 3 },
					constraints: [],
					totalScore: 27,
					rank: 2
				},
				{
					id: 'opt2',
					title: '候補B',
					parentId: null,
					status: 'in-progress',
					scores: { cost: 2, quality: 5 },
					constraints: [],
					totalScore: 31,
					rank: 1
				}
			];

			const html = renderer.renderOptionsTable(options, criteria);
			
			// 必要な列が含まれている
			expect(html).toContain('順位');
			expect(html).toContain('タイトル');
			expect(html).toContain('総合点');
			expect(html).toContain('コスト');
			expect(html).toContain('品質');
			
			// データが含まれている
			expect(html).toContain('候補A');
			expect(html).toContain('候補B');
			expect(html).toContain('27');
			expect(html).toContain('31');
		});

		it('should render empty message for no options', () => {
			const html = renderer.renderOptionsTable([], []);
			expect(html).toContain('選択肢がありません');
		});
	});

	describe('renderDecisionsTable', () => {
		it('should render decisions with status', () => {
			const decisions: Decision[] = [
				{
					id: 'dec1',
					title: '最終決定',
					decisionStatus: 'decided',
					decisionDate: '2024-03-15',
					options: ['候補A', '候補B'],
					chosen: '候補A',
					rationale: 'コストが最適',
					parentId: null
				},
				{
					id: 'dec2',
					title: '技術選定',
					decisionStatus: 'proposed',
					decisionDate: null,
					options: ['技術A', '技術B'],
					chosen: null,
					rationale: null,
					parentId: null
				}
			];

			const html = renderer.renderDecisionsTable(decisions);
			
			// 必要な列が含まれている
			expect(html).toContain('タイトル');
			expect(html).toContain('状態');
			expect(html).toContain('選択肢');
			expect(html).toContain('選択結果');
			
			// データが含まれている
			expect(html).toContain('最終決定');
			expect(html).toContain('技術選定');
			expect(html).toContain('決定済み');
			expect(html).toContain('提案中');
		});

		it('should render empty message for no decisions', () => {
			const html = renderer.renderDecisionsTable([]);
			expect(html).toContain('意思決定ログがありません');
		});
	});

	describe('renderRisksTable', () => {
		it('should render risks with exposure', () => {
			const risks: Risk[] = [
				{
					id: 'risk1',
					title: '予算超過',
					parentId: null,
					status: 'in-progress',
					probability: 4,
					impact: 5,
					exposure: 20,
					mitigation: '予備費確保',
					owner: '田中',
					dueDate: '2024-04-01'
				},
				{
					id: 'risk2',
					title: 'スケジュール遅延',
					parentId: null,
					status: 'not-started',
					probability: 3,
					impact: 3,
					exposure: 9,
					mitigation: null,
					owner: null,
					dueDate: null
				}
			];

			const html = renderer.renderRisksTable(risks);
			
			// 必要な列が含まれている
			expect(html).toContain('タイトル');
			expect(html).toContain('確率');
			expect(html).toContain('影響');
			expect(html).toContain('露出');
			expect(html).toContain('対策');
			expect(html).toContain('担当');
			
			// データが含まれている
			expect(html).toContain('予算超過');
			expect(html).toContain('スケジュール遅延');
			expect(html).toContain('20');
			expect(html).toContain('9');
			expect(html).toContain('田中');
		});

		it('should render empty message for no risks', () => {
			const html = renderer.renderRisksTable([]);
			expect(html).toContain('リスクがありません');
		});
	});

	describe('renderOverview', () => {
		it('should render project overview', () => {
			const project = createEmptyProject('test', 'テストプロジェクト');
			project.options.set('opt1', {
				id: 'opt1',
				title: '候補1',
				parentId: null,
				status: 'in-progress',
				scores: {},
				constraints: []
			});
			project.decisions.set('dec1', {
				id: 'dec1',
				title: '決定1',
				decisionStatus: 'proposed',
				decisionDate: null,
				options: [],
				chosen: null,
				rationale: null,
				parentId: null
			});
			project.risks.set('risk1', {
				id: 'risk1',
				title: 'リスク1',
				parentId: null,
				status: 'not-started',
				probability: 4,
				impact: 5,
				exposure: 20,
				mitigation: null,
				owner: null,
				dueDate: null
			});

			const html = renderer.renderOverview(project);
			
			expect(html).toContain('テストプロジェクト');
			expect(html).toContain('1'); // options count
			expect(html).toContain('未決'); // pending decisions
			expect(html).toContain('リスク1'); // top risk
		});
	});
});
