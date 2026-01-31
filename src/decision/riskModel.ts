/**
 * Risk Model
 * 
 * リスクの計算・ソート・レベル判定
 */
import { Risk } from './decisionDataModel';

/**
 * リスク値（確率・影響度）を1-5の範囲にクランプ
 */
export function clampRiskValue(value: number): number {
	if (typeof value !== 'number' || isNaN(value)) {
		return 1;
	}
	return Math.max(1, Math.min(5, value));
}

/**
 * リスク露出（exposure）を計算
 * exposure = probability × impact
 */
export function calculateExposure(probability: number, impact: number): number {
	const clampedProb = clampRiskValue(probability);
	const clampedImpact = clampRiskValue(impact);
	return clampedProb * clampedImpact;
}

/**
 * リスクを露出（exposure）降順でソート
 */
export function sortRisksByExposure(risks: Map<string, Risk>): Risk[] {
	return Array.from(risks.values()).sort((a, b) => b.exposure - a.exposure);
}

/**
 * 上位N件のリスクを取得
 */
export function getTopRisks(risks: Map<string, Risk>, n: number): Risk[] {
	const sorted = sortRisksByExposure(risks);
	return sorted.slice(0, n);
}

/**
 * リスクレベルの種別
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * リスクレベルの閾値
 */
const RISK_THRESHOLDS = {
	critical: 20, // 20-25
	high: 15,     // 15-19
	medium: 8     // 8-14
	// low: 1-7
};

/**
 * 露出値からリスクレベルを判定
 */
export function getRiskLevel(exposure: number): RiskLevel {
	if (exposure >= RISK_THRESHOLDS.critical) {
		return 'critical';
	}
	if (exposure >= RISK_THRESHOLDS.high) {
		return 'high';
	}
	if (exposure >= RISK_THRESHOLDS.medium) {
		return 'medium';
	}
	return 'low';
}

/**
 * リスクレベルに応じた色を取得
 */
export function getRiskLevelColor(level: RiskLevel): string {
	switch (level) {
		case 'critical':
			return '#dc2626'; // red-600
		case 'high':
			return '#ea580c'; // orange-600
		case 'medium':
			return '#ca8a04'; // yellow-600
		case 'low':
			return '#16a34a'; // green-600
		default:
			return '#6b7280'; // gray-500
	}
}

/**
 * リスクレベルのラベルを取得
 */
export function getRiskLevelLabel(level: RiskLevel): string {
	switch (level) {
		case 'critical':
			return '重大';
		case 'high':
			return '高';
		case 'medium':
			return '中';
		case 'low':
			return '低';
		default:
			return '不明';
	}
}
