/**
 * Risk Model Tests
 */
import {
	calculateExposure,
	clampRiskValue,
	sortRisksByExposure,
	getTopRisks,
	getRiskLevel
} from '../../src/decision/riskModel';
import { Risk } from '../../src/decision/decisionDataModel';

describe('Risk Model', () => {
	describe('clampRiskValue', () => {
		it('should return value as-is if within range', () => {
			expect(clampRiskValue(3)).toBe(3);
		});

		it('should clamp to minimum 1', () => {
			expect(clampRiskValue(0)).toBe(1);
			expect(clampRiskValue(-5)).toBe(1);
		});

		it('should clamp to maximum 5', () => {
			expect(clampRiskValue(6)).toBe(5);
			expect(clampRiskValue(100)).toBe(5);
		});

		it('should handle non-number values', () => {
			expect(clampRiskValue('high' as unknown as number)).toBe(1);
			expect(clampRiskValue(null as unknown as number)).toBe(1);
			expect(clampRiskValue(undefined as unknown as number)).toBe(1);
		});
	});

	describe('calculateExposure', () => {
		it('should multiply probability and impact', () => {
			expect(calculateExposure(3, 4)).toBe(12);
		});

		it('should return 1 for minimum values', () => {
			expect(calculateExposure(1, 1)).toBe(1);
		});

		it('should return 25 for maximum values', () => {
			expect(calculateExposure(5, 5)).toBe(25);
		});

		it('should clamp out of range values before calculation', () => {
			expect(calculateExposure(10, 0)).toBe(5); // 5 * 1 = 5
		});
	});

	describe('sortRisksByExposure', () => {
		it('should sort risks by exposure descending', () => {
			const risks: Map<string, Risk> = new Map([
				['r1', createRisk('r1', 'Low Risk', 1, 1)],
				['r2', createRisk('r2', 'High Risk', 5, 5)],
				['r3', createRisk('r3', 'Medium Risk', 3, 3)]
			]);

			const sorted = sortRisksByExposure(risks);
			
			expect(sorted[0].id).toBe('r2'); // 25
			expect(sorted[1].id).toBe('r3'); // 9
			expect(sorted[2].id).toBe('r1'); // 1
		});

		it('should return empty array for empty map', () => {
			const risks: Map<string, Risk> = new Map();
			const sorted = sortRisksByExposure(risks);
			expect(sorted).toEqual([]);
		});
	});

	describe('getTopRisks', () => {
		it('should return top N risks by exposure', () => {
			const risks: Map<string, Risk> = new Map([
				['r1', createRisk('r1', 'Risk 1', 1, 1)], // 1
				['r2', createRisk('r2', 'Risk 2', 5, 5)], // 25
				['r3', createRisk('r3', 'Risk 3', 3, 3)], // 9
				['r4', createRisk('r4', 'Risk 4', 4, 4)], // 16
				['r5', createRisk('r5', 'Risk 5', 2, 2)]  // 4
			]);

			const top3 = getTopRisks(risks, 3);
			
			expect(top3).toHaveLength(3);
			expect(top3[0].id).toBe('r2'); // 25
			expect(top3[1].id).toBe('r4'); // 16
			expect(top3[2].id).toBe('r3'); // 9
		});

		it('should return all risks if N exceeds count', () => {
			const risks: Map<string, Risk> = new Map([
				['r1', createRisk('r1', 'Risk 1', 1, 1)],
				['r2', createRisk('r2', 'Risk 2', 2, 2)]
			]);

			const top5 = getTopRisks(risks, 5);
			expect(top5).toHaveLength(2);
		});
	});

	describe('getRiskLevel', () => {
		it('should return critical for high exposure', () => {
			expect(getRiskLevel(20)).toBe('critical');
			expect(getRiskLevel(25)).toBe('critical');
		});

		it('should return high for medium-high exposure', () => {
			expect(getRiskLevel(15)).toBe('high');
			expect(getRiskLevel(19)).toBe('high');
		});

		it('should return medium for medium exposure', () => {
			expect(getRiskLevel(8)).toBe('medium');
			expect(getRiskLevel(14)).toBe('medium');
		});

		it('should return low for low exposure', () => {
			expect(getRiskLevel(1)).toBe('low');
			expect(getRiskLevel(7)).toBe('low');
		});
	});
});

// Helper function
function createRisk(id: string, title: string, probability: number, impact: number): Risk {
	return {
		id,
		title,
		parentId: null,
		status: 'not-started',
		probability,
		impact,
		exposure: probability * impact,
		mitigation: null,
		owner: null,
		dueDate: null
	};
}
