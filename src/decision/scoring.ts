/**
 * Scoring Logic
 * 
 * MCDA (Multi-Criteria Decision Analysis) スコア計算
 */
import { Criterion, DecisionOption } from './decisionDataModel';

/** デフォルトの最大スコア */
const DEFAULT_MAX_SCORE = 5;

/**
 * 方向性を考慮してスコアを正規化
 * lower-is-better の場合は反転する
 */
export function normalizeScore(
	score: number,
	criterion: Criterion,
	maxScore: number = DEFAULT_MAX_SCORE
): number {
	if (criterion.direction === 'lower-is-better') {
		return maxScore - score;
	}
	return score;
}

/**
 * 単一のOptionのスコアを計算
 * 未入力は0として扱う
 */
export function calculateOptionScore(
	option: DecisionOption,
	criteria: Criterion[],
	maxScore: number = DEFAULT_MAX_SCORE
): number {
	if (criteria.length === 0) {
		return 0;
	}

	let totalScore = 0;

	for (const criterion of criteria) {
		const rawScore = option.scores[criterion.key] ?? 0;
		const normalizedScore = normalizeScore(rawScore, criterion, maxScore);
		totalScore += criterion.weight * normalizedScore;
	}

	return totalScore;
}

/**
 * すべてのOptionのスコアを計算してMapを返す
 */
export function calculateAllScores(
	options: Map<string, DecisionOption>,
	criteria: Criterion[],
	maxScore: number = DEFAULT_MAX_SCORE
): Map<string, DecisionOption> {
	const result = new Map<string, DecisionOption>();

	for (const [id, option] of options) {
		const totalScore = calculateOptionScore(option, criteria, maxScore);
		result.set(id, {
			...option,
			totalScore
		});
	}

	return result;
}

/**
 * Optionをスコア順にランキングして配列で返す
 */
export function rankOptions(
	options: Map<string, DecisionOption>,
	criteria: Criterion[],
	maxScore: number = DEFAULT_MAX_SCORE
): DecisionOption[] {
	const scoredOptions = calculateAllScores(options, criteria, maxScore);
	
	// スコア降順でソート
	const sorted = Array.from(scoredOptions.values()).sort((a, b) => {
		return (b.totalScore ?? 0) - (a.totalScore ?? 0);
	});

	// ランク付け（同点は同じランク）
	let currentRank = 1;
	let previousScore: number | null = null;

	for (let i = 0; i < sorted.length; i++) {
		const option = sorted[i];
		const score = option.totalScore ?? 0;

		if (previousScore !== null && score < previousScore) {
			currentRank = i + 1;
		}

		sorted[i] = {
			...option,
			rank: currentRank
		};

		previousScore = score;
	}

	return sorted;
}
