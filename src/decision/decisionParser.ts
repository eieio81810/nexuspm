/**
 * Decision Parser
 * 
 * frontmatterからDecision Project関連のデータをパースする
 */
import { TFile, MetadataCache, Vault } from 'obsidian';
import {
	DecisionItemType,
	DecisionProjectConfig,
	DecisionOption,
	Decision,
	Risk,
	Assumption,
	Evidence,
	Memo,
	DecisionProject,
	Criterion,
	Gate,
	Constraint,
	DEFAULT_PROJECT_CONFIG,
	createDefaultOption,
	createDefaultDecision,
	createDefaultRisk,
	createDefaultAssumption,
	createDefaultEvidence,
	createDefaultMemo,
	createEmptyProject,
	normalizeDecisionStatus,
	normalizeAssumptionStatus,
	normalizeConstraintStatus
} from './decisionDataModel';

interface FrontmatterData {
	[key: string]: unknown;
}

export class DecisionParser {
	constructor(
		private metadataCache: MetadataCache,
		private vault: Vault
	) {}

	/**
	 * frontmatterからnexuspm-typeを検出
	 */
	detectItemType(frontmatter: FrontmatterData): DecisionItemType | null {
		const typeValue = frontmatter['nexuspm-type'];
		if (!typeValue || typeof typeValue !== 'string') {
			return null;
		}

		const normalized = typeValue.toLowerCase().trim();
		const validTypes: DecisionItemType[] = [
			'decision-project',
			'memo',
			'option',
			'decision',
			'risk',
			'assumption',
			'evidence',
			'task'
		];

		if (validTypes.includes(normalized as DecisionItemType)) {
			return normalized as DecisionItemType;
		}

		return null;
	}

	/**
	 * リンクターゲットを抽出
	 */
	extractLinkTarget(link: string): string | null {
		if (!link) {
			return null;
		}

		// Wiki link: [[target]] or [[target|alias]]
		const wikiMatch = link.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/);
		if (wikiMatch) {
			return wikiMatch[1];
		}

		// Markdown link: [alias](target.md)
		const mdMatch = link.match(/\[[^\]]*\]\(([^)]+)\)/);
		if (mdMatch) {
			return mdMatch[1].replace(/\.md$/, '');
		}

		// Plain text
		return link;
	}

	/**
	 * 複数のリンクを抽出
	 */
	extractMultipleLinks(links: unknown): string[] {
		if (!Array.isArray(links)) {
			return [];
		}

		return links
			.map(link => {
				if (typeof link === 'string') {
					return this.extractLinkTarget(link);
				}
				return null;
			})
			.filter((link): link is string => link !== null && link !== '');
	}

	/**
	 * プロジェクト設定をパース
	 */
	parseProjectConfig(frontmatter: FrontmatterData): DecisionProjectConfig {
		const config: DecisionProjectConfig = {
			criteria: [],
			gates: [],
			scoringMissing: 'zero'
		};

		// Parse criteria
		if (Array.isArray(frontmatter.criteria)) {
			config.criteria = frontmatter.criteria
				.filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
				.map((c): Criterion => ({
					key: String(c.key || ''),
					label: String(c.label || c.key || ''),
					weight: typeof c.weight === 'number' ? c.weight : 1,
					direction: c.direction === 'lower-is-better' ? 'lower-is-better' : undefined,
					description: typeof c.description === 'string' ? c.description : undefined
				}))
				.filter(c => c.key !== '');
		}

		// Parse gates
		if (Array.isArray(frontmatter.gates)) {
			config.gates = frontmatter.gates
				.filter((g): g is Record<string, unknown> => typeof g === 'object' && g !== null)
				.map((g): Gate => ({
					key: String(g.key || ''),
					label: String(g.label || g.key || ''),
					mustTags: Array.isArray(g.mustTags) ? g.mustTags.map(String) : undefined,
					mustDecisions: Array.isArray(g.mustDecisions) ? g.mustDecisions.map(String) : undefined
				}))
				.filter(g => g.key !== '');
		}

		return config;
	}

	/**
	 * Optionをパース
	 */
	parseOption(file: TFile): DecisionOption | null {
		const cache = this.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter as FrontmatterData | undefined;

		const option = createDefaultOption(file.path, file.basename);

		// タイトル: H1見出しまたはファイル名
		const h1Heading = cache?.headings?.find(h => h.level === 1);
		if (h1Heading) {
			option.title = h1Heading.heading;
		}

		if (!frontmatter) {
			return option;
		}

		// 親リンク
		const parentLink = frontmatter.parent;
		if (parentLink && typeof parentLink === 'string') {
			option.parentId = this.extractLinkTarget(parentLink);
		}

		// ステータス
		if (typeof frontmatter.status === 'string') {
			option.status = frontmatter.status;
		}

		// スコア
		if (frontmatter.scores && typeof frontmatter.scores === 'object') {
			const scores = frontmatter.scores as Record<string, unknown>;
			for (const [key, value] of Object.entries(scores)) {
				if (typeof value === 'number') {
					option.scores[key] = value;
				} else if (typeof value === 'string') {
					const parsed = parseFloat(value);
					option.scores[key] = isNaN(parsed) ? 0 : parsed;
				} else {
					option.scores[key] = 0;
				}
			}
		}

		// 制約条件
		if (Array.isArray(frontmatter.constraints)) {
			option.constraints = frontmatter.constraints
				.filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
				.map((c): Constraint => ({
					key: String(c.key || ''),
					status: normalizeConstraintStatus(typeof c.status === 'string' ? c.status : undefined),
					evidence: typeof c.evidence === 'string' ? this.extractLinkTarget(c.evidence) || undefined : undefined
				}))
				.filter(c => c.key !== '');
		}

		return option;
	}

	/**
	 * Decisionをパース
	 */
	parseDecision(file: TFile): Decision | null {
		const cache = this.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter as FrontmatterData | undefined;

		const decision = createDefaultDecision(file.path, file.basename);

		// タイトル
		const h1Heading = cache?.headings?.find(h => h.level === 1);
		if (h1Heading) {
			decision.title = h1Heading.heading;
		}

		if (!frontmatter) {
			return decision;
		}

		// 親リンク
		const parentLink = frontmatter.parent;
		if (parentLink && typeof parentLink === 'string') {
			decision.parentId = this.extractLinkTarget(parentLink);
		}

		// Decision status
		decision.decisionStatus = normalizeDecisionStatus(
			typeof frontmatter['decision-status'] === 'string' ? frontmatter['decision-status'] : undefined
		);

		// Decision date
		if (typeof frontmatter['decision-date'] === 'string') {
			decision.decisionDate = frontmatter['decision-date'];
		}

		// Options
		decision.options = this.extractMultipleLinks(frontmatter.options);

		// Chosen
		if (typeof frontmatter.chosen === 'string') {
			decision.chosen = this.extractLinkTarget(frontmatter.chosen);
		}

		// Rationale
		if (typeof frontmatter.rationale === 'string') {
			decision.rationale = frontmatter.rationale;
		}

		return decision;
	}

	/**
	 * Riskをパース
	 */
	parseRisk(file: TFile): Risk | null {
		const cache = this.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter as FrontmatterData | undefined;

		const risk = createDefaultRisk(file.path, file.basename);

		// タイトル
		const h1Heading = cache?.headings?.find(h => h.level === 1);
		if (h1Heading) {
			risk.title = h1Heading.heading;
		}

		if (!frontmatter) {
			return risk;
		}

		// 親リンク
		const parentLink = frontmatter.parent;
		if (parentLink && typeof parentLink === 'string') {
			risk.parentId = this.extractLinkTarget(parentLink);
		}

		// ステータス
		if (typeof frontmatter.status === 'string') {
			risk.status = frontmatter.status;
		}

		// Probability (clamp to 1-5)
		if (typeof frontmatter.probability === 'number') {
			risk.probability = Math.max(1, Math.min(5, frontmatter.probability));
		}

		// Impact (clamp to 1-5)
		if (typeof frontmatter.impact === 'number') {
			risk.impact = Math.max(1, Math.min(5, frontmatter.impact));
		}

		// Calculate exposure
		risk.exposure = risk.probability * risk.impact;

		// Mitigation
		if (typeof frontmatter.mitigation === 'string') {
			risk.mitigation = this.extractLinkTarget(frontmatter.mitigation) || frontmatter.mitigation;
		}

		// Owner
		if (typeof frontmatter.owner === 'string') {
			risk.owner = frontmatter.owner;
		}

		// Due date
		if (typeof frontmatter['due-date'] === 'string') {
			risk.dueDate = frontmatter['due-date'];
		}

		return risk;
	}

	/**
	 * Assumptionをパース
	 */
	parseAssumption(file: TFile): Assumption | null {
		const cache = this.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter as FrontmatterData | undefined;

		const assumption = createDefaultAssumption(file.path, file.basename);

		// タイトル
		const h1Heading = cache?.headings?.find(h => h.level === 1);
		if (h1Heading) {
			assumption.title = h1Heading.heading;
		}

		if (!frontmatter) {
			return assumption;
		}

		// 親リンク
		const parentLink = frontmatter.parent;
		if (parentLink && typeof parentLink === 'string') {
			assumption.parentId = this.extractLinkTarget(parentLink);
		}

		// Assumption status
		assumption.assumptionStatus = normalizeAssumptionStatus(
			typeof frontmatter['assumption-status'] === 'string' ? frontmatter['assumption-status'] : undefined
		);

		// Evidence links
		assumption.evidence = this.extractMultipleLinks(frontmatter.evidence);

		return assumption;
	}

	/**
	 * Evidenceをパース
	 */
	parseEvidence(file: TFile): Evidence | null {
		const cache = this.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter as FrontmatterData | undefined;

		const evidence = createDefaultEvidence(file.path, file.basename);

		// タイトル
		const h1Heading = cache?.headings?.find(h => h.level === 1);
		if (h1Heading) {
			evidence.title = h1Heading.heading;
		}

		if (!frontmatter) {
			return evidence;
		}

		// 親リンク
		const parentLink = frontmatter.parent;
		if (parentLink && typeof parentLink === 'string') {
			evidence.parentId = this.extractLinkTarget(parentLink);
		}

		// Source URL
		if (typeof frontmatter['source-url'] === 'string') {
			evidence.sourceUrl = frontmatter['source-url'];
		}

		// Source type
		if (typeof frontmatter['source-type'] === 'string') {
			evidence.sourceType = frontmatter['source-type'];
		}

		// Captured at
		if (typeof frontmatter['captured-at'] === 'string') {
			evidence.capturedAt = frontmatter['captured-at'];
		}

		return evidence;
	}

	/**
	 * Memoをパース
	 */
	parseMemo(file: TFile): Memo | null {
		const cache = this.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter as FrontmatterData | undefined;

		const memo = createDefaultMemo(file.path, file.basename);

		// タイトル
		const h1Heading = cache?.headings?.find(h => h.level === 1);
		if (h1Heading) {
			memo.title = h1Heading.heading;
		}

		if (!frontmatter) {
			return memo;
		}

		// 親リンク
		const parentLink = frontmatter.parent;
		if (parentLink && typeof parentLink === 'string') {
			memo.parentId = this.extractLinkTarget(parentLink);
		}

		// タグ
		if (Array.isArray(frontmatter.tags)) {
			memo.tags = frontmatter.tags
				.filter((t): t is string => typeof t === 'string')
				.map(t => t.trim());
		}

		// 昇格先タイプ
		if (typeof frontmatter['promote-to'] === 'string') {
			const promoteType = frontmatter['promote-to'].toLowerCase().trim();
			const validPromoteTypes: DecisionItemType[] = ['option', 'risk', 'assumption', 'evidence'];
			if (validPromoteTypes.includes(promoteType as DecisionItemType)) {
				memo.promoteToType = promoteType as DecisionItemType;
			}
		}

		return memo;
	}

	/**
	 * フォルダ内のプロジェクト設定を探す
	 */
	findProjectConfig(folderPath: string): DecisionProjectConfig {
		const allFiles = this.vault.getMarkdownFiles();
		const folderFiles = allFiles.filter(file =>
			file.path.startsWith(folderPath + '/') || file.path === folderPath
		);

		// decision-projectタイプのファイルを探す
		const projectFiles: TFile[] = [];
		for (const file of folderFiles) {
			const cache = this.metadataCache.getFileCache(file);
			const frontmatter = cache?.frontmatter as FrontmatterData | undefined;
			if (frontmatter && this.detectItemType(frontmatter) === 'decision-project') {
				projectFiles.push(file);
			}
		}

		if (projectFiles.length === 0) {
			return { ...DEFAULT_PROJECT_CONFIG };
		}

		// _projectで始まるファイルを優先
		const priorityFile = projectFiles.find(f => f.basename.startsWith('_project'));
		const targetFile = priorityFile || projectFiles[0];

		const cache = this.metadataCache.getFileCache(targetFile);
		const frontmatter = cache?.frontmatter as FrontmatterData | undefined;

		if (!frontmatter) {
			return { ...DEFAULT_PROJECT_CONFIG };
		}

		return this.parseProjectConfig(frontmatter);
	}

	/**
	 * フォルダ全体をパースしてDecisionProjectを生成
	 */
	parseFolder(folderPath: string): DecisionProject {
		const projectName = folderPath.split('/').pop() || folderPath;
		const project = createEmptyProject(folderPath, projectName);

		// プロジェクト設定を取得
		project.config = this.findProjectConfig(folderPath);

		// フォルダ内のMarkdownファイルを取得
		const allFiles = this.vault.getMarkdownFiles();
		const folderFiles = allFiles.filter(file =>
			file.path.startsWith(folderPath + '/') || file.path === folderPath
		);

		// 各ファイルをパース
		for (const file of folderFiles) {
			const cache = this.metadataCache.getFileCache(file);
			const frontmatter = cache?.frontmatter as FrontmatterData | undefined;

			if (!frontmatter) {
				continue;
			}

			const itemType = this.detectItemType(frontmatter);
			if (!itemType) {
				continue;
			}

			switch (itemType) {
				case 'decision-project':
					// プロジェクト設定はすでに取得済み
					// プロジェクト名をH1から取得
					const h1 = cache?.headings?.find(h => h.level === 1);
					if (h1) {
						project.name = h1.heading;
					}
					break;

				case 'memo': {
					const memo = this.parseMemo(file);
					if (memo) {
						project.memos.set(file.path, memo);
					}
					break;
				}

				case 'option': {
					const option = this.parseOption(file);
					if (option) {
						project.options.set(file.path, option);
					}
					break;
				}

				case 'decision': {
					const decision = this.parseDecision(file);
					if (decision) {
						project.decisions.set(file.path, decision);
					}
					break;
				}

				case 'risk': {
					const risk = this.parseRisk(file);
					if (risk) {
						project.risks.set(file.path, risk);
					}
					break;
				}

				case 'assumption': {
					const assumption = this.parseAssumption(file);
					if (assumption) {
						project.assumptions.set(file.path, assumption);
					}
					break;
				}

				case 'evidence': {
					const evidence = this.parseEvidence(file);
					if (evidence) {
						project.evidences.set(file.path, evidence);
					}
					break;
				}
			}
		}

		project.lastUpdated = new Date();
		return project;
	}
}
