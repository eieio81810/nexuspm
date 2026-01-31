/**
 * Scoring Tests
 */
import {
	calculateOptionScore,
	calculateAllScores,
	rankOptions,
	normalizeScore
} from '../../src/decision/scoring';
import { Criterion, DecisionOption, DecisionProjectConfig } from '../../src/decision/decisionDataModel';

describe('Scoring', () => {
	describe('normalizeScore', () => {
		it('should return score as-is for higher-is-better', () => {
			const criterion: Criterion = { key: 'quality', label: '品質', weight: 1 };
			expect(normalizeScore(4, criterion, 5)).toBe(4);
		});

		it('should invert score for lower-is-better', () => {
			const criterion: Criterion = { key: 'cost', label: 'コスト', weight: 1, direction: 'lower-is-better' };
			// maxScore=5, score=4 -> 5 - 4 = 1
			expect(normalizeScore(4, criterion, 5)).toBe(1);
		});

		it('should handle zero score', () => {
			const criterion: Criterion = { key: 'cost', label: 'コスト', weight: 1, direction: 'lower-is-better' };
			// maxScore=5, score=0 -> 5 - 0 = 5
			expect(normalizeScore(0, criterion, 5)).toBe(5);
		});
	});

	describe('calculateOptionScore', () => {
		const criteria: Criterion[] = [
			{ key: 'cost', label: 'コスト', weight: 3 },
			{ key: 'quality', label: '品質', weight: 5 },
			{ key: 'timeline', label: '納期', weight: 2 }
		];

		it('should calculate weighted sum correctly', () => {
			const option: DecisionOption = {
				id: 'option1',
				title: '候補1',
				parentId: null,
				status: 'in-progress',
				scores: { cost: 4, quality: 3, timeline: 5 },
				constraints: []
			};

			// 3*4 + 5*3 + 2*5 = 12 + 15 + 10 = 37
			const score = calculateOptionScore(option, criteria);
			expect(score).toBe(37);
		});

		it('should treat missing scores as 0', () => {
			const option: DecisionOption = {
				id: 'option1',
				title: '候補1',
				parentId: null,
				status: 'in-progress',
				scores: { cost: 4 }, // quality and timeline missing
				constraints: []
			};

			// 3*4 + 5*0 + 2*0 = 12
			const score = calculateOptionScore(option, criteria);
			expect(score).toBe(12);
		});

		it('should return 0 for empty scores', () => {
			const option: DecisionOption = {
				id: 'option1',
				title: '候補1',
				parentId: null,
				status: 'in-progress',
				scores: {},
				constraints: []
			};

			const score = calculateOptionScore(option, criteria);
			expect(score).toBe(0);
		});

		it('should return 0 for empty criteria', () => {
			const option: DecisionOption = {
				id: 'option1',
				title: '候補1',
				parentId: null,
				status: 'in-progress',
				scores: { cost: 4, quality: 3 },
				constraints: []
			};

			const score = calculateOptionScore(option, []);
			expect(score).toBe(0);
		});

		it('should handle lower-is-better direction', () => {
			const criteriaWithDirection: Criterion[] = [
				{ key: 'cost', label: 'コスト', weight: 3, direction: 'lower-is-better' },
				{ key: 'quality', label: '品質', weight: 5 }
			];

			const option: DecisionOption = {
				id: 'option1',
				title: '候補1',
				parentId: null,
				status: 'in-progress',
				scores: { cost: 4, quality: 3 },
				constraints: []
			};

			// cost: 3*(5-4)=3, quality: 5*3=15 -> 18
			const score = calculateOptionScore(option, criteriaWithDirection, 5);
			expect(score).toBe(18);
		});
	});

	describe('calculateAllScores', () => {
		const criteria: Criterion[] = [
			{ key: 'cost', label: 'コスト', weight: 3 },
			{ key: 'quality', label: '品質', weight: 5 }
		];

		it('should calculate scores for all options', () => {
			const options: Map<string, DecisionOption> = new Map([
				['opt1', {
					id: 'opt1',
					title: '候補1',
					parentId: null,
					status: 'in-progress',
					scores: { cost: 4, quality: 3 },
					constraints: []
				}],
				['opt2', {
					id: 'opt2',
					title: '候補2',
					parentId: null,
					status: 'in-progress',
					scores: { cost: 2, quality: 5 },
					constraints: []
				}]
			]);

			const result = calculateAllScores(options, criteria);
			
			// opt1: 3*4 + 5*3 = 27
			expect(result.get('opt1')!.totalScore).toBe(27);
			// opt2: 3*2 + 5*5 = 31
			expect(result.get('opt2')!.totalScore).toBe(31);
		});
	});

	describe('rankOptions', () => {
		const criteria: Criterion[] = [
			{ key: 'cost', label: 'コスト', weight: 3 },
			{ key: 'quality', label: '品質', weight: 5 }
		];

		it('should rank options by total score descending', () => {
			const options: Map<string, DecisionOption> = new Map([
				['opt1', {
					id: 'opt1',
					title: '候補1',
					parentId: null,
					status: 'in-progress',
					scores: { cost: 4, quality: 3 }, // 27
					constraints: []
				}],
				['opt2', {
					id: 'opt2',
					title: '候補2',
					parentId: null,
					status: 'in-progress',
					scores: { cost: 2, quality: 5 }, // 31
					constraints: []
				}],
				['opt3', {
					id: 'opt3',
					title: '候補3',
					parentId: null,
					status: 'in-progress',
					scores: { cost: 5, quality: 4 }, // 35
					constraints: []
				}]
			]);

			const ranked = rankOptions(options, criteria);
			
			expect(ranked[0].id).toBe('opt3');
			expect(ranked[0].rank).toBe(1);
			expect(ranked[1].id).toBe('opt2');
			expect(ranked[1].rank).toBe(2);
			expect(ranked[2].id).toBe('opt1');
			expect(ranked[2].rank).toBe(3);
		});

		it('should handle ties with same rank', () => {
			const options: Map<string, DecisionOption> = new Map([
				['opt1', {
					id: 'opt1',
					title: '候補1',
					parentId: null,
					status: 'in-progress',
					scores: { cost: 4, quality: 3 }, // 27
					constraints: []
				}],
				['opt2', {
					id: 'opt2',
					title: '候補2',
					parentId: null,
					status: 'in-progress',
					scores: { cost: 4, quality: 3 }, // 27 (same)
					constraints: []
				}]
			]);

			const ranked = rankOptions(options, criteria);
			
			expect(ranked[0].rank).toBe(1);
			expect(ranked[1].rank).toBe(1);
		});

		it('should return empty array for empty options', () => {
			const options: Map<string, DecisionOption> = new Map();
			const ranked = rankOptions(options, criteria);
			expect(ranked).toEqual([]);
		});
	});
});
