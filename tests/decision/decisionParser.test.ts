/**
 * Decision Parser Tests
 */
import { DecisionParser } from '../../src/decision/decisionParser';
import {
	DecisionItemType,
	DecisionProjectConfig,
	DecisionOption,
	Decision,
	Risk,
	Assumption,
	Evidence
} from '../../src/decision/decisionDataModel';

// Mock Obsidian types
interface MockTFile {
	path: string;
	basename: string;
}

interface MockCachedMetadata {
	frontmatter?: Record<string, unknown>;
	headings?: Array<{ level: number; heading: string }>;
}

interface MockMetadataCache {
	getFileCache(file: MockTFile): MockCachedMetadata | null;
}

interface MockVault {
	getMarkdownFiles(): MockTFile[];
}

describe('DecisionParser', () => {
	let mockMetadataCache: MockMetadataCache;
	let mockVault: MockVault;
	let parser: DecisionParser;
	let fileCacheMap: Map<string, MockCachedMetadata>;

	beforeEach(() => {
		fileCacheMap = new Map();
		mockMetadataCache = {
			getFileCache: (file: MockTFile) => fileCacheMap.get(file.path) || null
		};
		mockVault = {
			getMarkdownFiles: () => Array.from(fileCacheMap.keys()).map(path => ({
				path,
				basename: path.split('/').pop()?.replace('.md', '') || path
			}))
		};
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		parser = new DecisionParser(mockMetadataCache as any, mockVault as any);
	});

	describe('detectItemType', () => {
		it('should detect decision-project type', () => {
			const type = parser.detectItemType({ 'nexuspm-type': 'decision-project' });
			expect(type).toBe('decision-project');
		});

		it('should detect option type', () => {
			const type = parser.detectItemType({ 'nexuspm-type': 'option' });
			expect(type).toBe('option');
		});

		it('should detect decision type', () => {
			const type = parser.detectItemType({ 'nexuspm-type': 'decision' });
			expect(type).toBe('decision');
		});

		it('should detect risk type', () => {
			const type = parser.detectItemType({ 'nexuspm-type': 'risk' });
			expect(type).toBe('risk');
		});

		it('should detect assumption type', () => {
			const type = parser.detectItemType({ 'nexuspm-type': 'assumption' });
			expect(type).toBe('assumption');
		});

		it('should detect evidence type', () => {
			const type = parser.detectItemType({ 'nexuspm-type': 'evidence' });
			expect(type).toBe('evidence');
		});

		it('should return null for unknown type', () => {
			const type = parser.detectItemType({ 'nexuspm-type': 'unknown' });
			expect(type).toBeNull();
		});

		it('should return null for missing type', () => {
			const type = parser.detectItemType({});
			expect(type).toBeNull();
		});

		it('should handle case-insensitive type', () => {
			const type = parser.detectItemType({ 'nexuspm-type': 'OPTION' });
			expect(type).toBe('option');
		});
	});

	describe('extractLinkTarget', () => {
		it('should extract target from wiki link [[Target]]', () => {
			const target = parser.extractLinkTarget('[[Target]]');
			expect(target).toBe('Target');
		});

		it('should extract target from wiki link with alias [[Target|alias]]', () => {
			const target = parser.extractLinkTarget('[[Target|Display Name]]');
			expect(target).toBe('Target');
		});

		it('should extract target from markdown link [alias](target.md)', () => {
			const target = parser.extractLinkTarget('[Display](target.md)');
			expect(target).toBe('target');
		});

		it('should return plain text as-is', () => {
			const target = parser.extractLinkTarget('PlainText');
			expect(target).toBe('PlainText');
		});

		it('should return null for empty string', () => {
			const target = parser.extractLinkTarget('');
			expect(target).toBeNull();
		});

		it('should return null for null input', () => {
			const target = parser.extractLinkTarget(null as unknown as string);
			expect(target).toBeNull();
		});
	});

	describe('extractMultipleLinks', () => {
		it('should extract multiple wiki links from array', () => {
			const links = parser.extractMultipleLinks(['[[A]]', '[[B]]', '[[C]]']);
			expect(links).toEqual(['A', 'B', 'C']);
		});

		it('should extract wiki links with aliases', () => {
			const links = parser.extractMultipleLinks(['[[A|Alias A]]', '[[B|Alias B]]']);
			expect(links).toEqual(['A', 'B']);
		});

		it('should handle mixed formats', () => {
			const links = parser.extractMultipleLinks(['[[A]]', '[B](b.md)', 'C']);
			expect(links).toEqual(['A', 'b', 'C']);
		});

		it('should return empty array for non-array input', () => {
			const links = parser.extractMultipleLinks('[[A]]' as unknown as string[]);
			expect(links).toEqual([]);
		});

		it('should filter out empty values', () => {
			const links = parser.extractMultipleLinks(['[[A]]', '', '[[B]]']);
			expect(links).toEqual(['A', 'B']);
		});
	});

	describe('parseProjectConfig', () => {
		it('should parse criteria from frontmatter', () => {
			const frontmatter = {
				'nexuspm-type': 'decision-project',
				criteria: [
					{ key: 'cost', label: 'コスト', weight: 3 },
					{ key: 'quality', label: '品質', weight: 5, direction: 'lower-is-better' }
				]
			};
			const config = parser.parseProjectConfig(frontmatter);
			expect(config.criteria).toHaveLength(2);
			expect(config.criteria[0].key).toBe('cost');
			expect(config.criteria[0].label).toBe('コスト');
			expect(config.criteria[0].weight).toBe(3);
			expect(config.criteria[1].key).toBe('quality');
			expect(config.criteria[1].direction).toBe('lower-is-better');
		});

		it('should handle missing criteria', () => {
			const frontmatter = { 'nexuspm-type': 'decision-project' };
			const config = parser.parseProjectConfig(frontmatter);
			expect(config.criteria).toEqual([]);
		});

		it('should parse gates', () => {
			const frontmatter = {
				'nexuspm-type': 'decision-project',
				gates: [
					{ key: 'research', label: '調査完了' },
					{ key: 'final', label: '最終決定' }
				]
			};
			const config = parser.parseProjectConfig(frontmatter);
			expect(config.gates).toHaveLength(2);
		});

		it('should set scoringMissing to zero', () => {
			const frontmatter = { 'nexuspm-type': 'decision-project' };
			const config = parser.parseProjectConfig(frontmatter);
			expect(config.scoringMissing).toBe('zero');
		});
	});

	describe('parseOption', () => {
		it('should parse option with scores', () => {
			const file: MockTFile = { path: 'project/optionA.md', basename: 'optionA' };
			fileCacheMap.set(file.path, {
				frontmatter: {
					'nexuspm-type': 'option',
					scores: { cost: 4, quality: 3 },
					status: 'in-progress'
				},
				headings: [{ level: 1, heading: '候補A' }]
			});

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const option = parser.parseOption(file as any);
			expect(option).not.toBeNull();
			expect(option!.title).toBe('候補A');
			expect(option!.scores).toEqual({ cost: 4, quality: 3 });
			expect(option!.status).toBe('in-progress');
		});

		it('should handle missing scores', () => {
			const file: MockTFile = { path: 'project/optionA.md', basename: 'optionA' };
			fileCacheMap.set(file.path, {
				frontmatter: { 'nexuspm-type': 'option' }
			});

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const option = parser.parseOption(file as any);
			expect(option!.scores).toEqual({});
		});

		it('should handle invalid score types gracefully', () => {
			const file: MockTFile = { path: 'project/optionA.md', basename: 'optionA' };
			fileCacheMap.set(file.path, {
				frontmatter: {
					'nexuspm-type': 'option',
					scores: { cost: 'invalid', quality: 3 }
				}
			});

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const option = parser.parseOption(file as any);
			// Invalid scores should be ignored or converted to 0
			expect(option!.scores.quality).toBe(3);
			expect(option!.scores.cost).toBe(0);
		});

		it('should parse constraints', () => {
			const file: MockTFile = { path: 'project/optionA.md', basename: 'optionA' };
			fileCacheMap.set(file.path, {
				frontmatter: {
					'nexuspm-type': 'option',
					constraints: [
						{ key: 'budget', status: 'pass' },
						{ key: 'location', status: 'fail', evidence: '[[調査メモ]]' }
					]
				}
			});

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const option = parser.parseOption(file as any);
			expect(option!.constraints).toHaveLength(2);
			expect(option!.constraints[0]).toEqual({ key: 'budget', status: 'pass' });
			expect(option!.constraints[1]).toEqual({ key: 'location', status: 'fail', evidence: '調査メモ' });
		});
	});

	describe('parseDecision', () => {
		it('should parse decision with options and chosen', () => {
			const file: MockTFile = { path: 'project/decision1.md', basename: 'decision1' };
			fileCacheMap.set(file.path, {
				frontmatter: {
					'nexuspm-type': 'decision',
					'decision-status': 'decided',
					'decision-date': '2024-03-15',
					options: ['[[候補A]]', '[[候補B]]'],
					chosen: '[[候補A]]',
					rationale: 'コストが最も低い'
				},
				headings: [{ level: 1, heading: '決定：候補Aを採用' }]
			});

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const decision = parser.parseDecision(file as any);
			expect(decision).not.toBeNull();
			expect(decision!.decisionStatus).toBe('decided');
			expect(decision!.decisionDate).toBe('2024-03-15');
			expect(decision!.options).toEqual(['候補A', '候補B']);
			expect(decision!.chosen).toBe('候補A');
			expect(decision!.rationale).toBe('コストが最も低い');
		});

		it('should handle proposed status', () => {
			const file: MockTFile = { path: 'project/decision1.md', basename: 'decision1' };
			fileCacheMap.set(file.path, {
				frontmatter: {
					'nexuspm-type': 'decision',
					'decision-status': 'proposed'
				}
			});

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const decision = parser.parseDecision(file as any);
			expect(decision!.decisionStatus).toBe('proposed');
		});

		it('should normalize Japanese decision status', () => {
			const file: MockTFile = { path: 'project/decision1.md', basename: 'decision1' };
			fileCacheMap.set(file.path, {
				frontmatter: {
					'nexuspm-type': 'decision',
					'decision-status': '決定済み'
				}
			});

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const decision = parser.parseDecision(file as any);
			expect(decision!.decisionStatus).toBe('decided');
		});
	});

	describe('parseRisk', () => {
		it('should parse risk with probability and impact', () => {
			const file: MockTFile = { path: 'project/risk1.md', basename: 'risk1' };
			fileCacheMap.set(file.path, {
				frontmatter: {
					'nexuspm-type': 'risk',
					probability: 3,
					impact: 4,
					mitigation: '[[対策タスク]]',
					owner: '田中',
					'due-date': '2024-04-01'
				},
				headings: [{ level: 1, heading: '予算超過リスク' }]
			});

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const risk = parser.parseRisk(file as any);
			expect(risk).not.toBeNull();
			expect(risk!.probability).toBe(3);
			expect(risk!.impact).toBe(4);
			expect(risk!.exposure).toBe(12);
			expect(risk!.mitigation).toBe('対策タスク');
			expect(risk!.owner).toBe('田中');
		});

		it('should clamp probability and impact to 1-5 range', () => {
			const file: MockTFile = { path: 'project/risk1.md', basename: 'risk1' };
			fileCacheMap.set(file.path, {
				frontmatter: {
					'nexuspm-type': 'risk',
					probability: 10,
					impact: -1
				}
			});

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const risk = parser.parseRisk(file as any);
			expect(risk!.probability).toBe(5);
			expect(risk!.impact).toBe(1);
			expect(risk!.exposure).toBe(5);
		});

		it('should default to 1 for invalid values', () => {
			const file: MockTFile = { path: 'project/risk1.md', basename: 'risk1' };
			fileCacheMap.set(file.path, {
				frontmatter: {
					'nexuspm-type': 'risk',
					probability: 'high',
					impact: null
				}
			});

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const risk = parser.parseRisk(file as any);
			expect(risk!.probability).toBe(1);
			expect(risk!.impact).toBe(1);
		});
	});

	describe('parseAssumption', () => {
		it('should parse assumption with status and evidence', () => {
			const file: MockTFile = { path: 'project/assumption1.md', basename: 'assumption1' };
			fileCacheMap.set(file.path, {
				frontmatter: {
					'nexuspm-type': 'assumption',
					'assumption-status': 'testing',
					evidence: ['[[調査結果1]]', '[[ヒアリングメモ]]']
				},
				headings: [{ level: 1, heading: '市場成長仮説' }]
			});

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const assumption = parser.parseAssumption(file as any);
			expect(assumption).not.toBeNull();
			expect(assumption!.assumptionStatus).toBe('testing');
			expect(assumption!.evidence).toEqual(['調査結果1', 'ヒアリングメモ']);
		});

		it('should normalize Japanese assumption status', () => {
			const file: MockTFile = { path: 'project/assumption1.md', basename: 'assumption1' };
			fileCacheMap.set(file.path, {
				frontmatter: {
					'nexuspm-type': 'assumption',
					'assumption-status': '検証済み'
				}
			});

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const assumption = parser.parseAssumption(file as any);
			expect(assumption!.assumptionStatus).toBe('validated');
		});
	});

	describe('parseEvidence', () => {
		it('should parse evidence with source info', () => {
			const file: MockTFile = { path: 'project/evidence1.md', basename: 'evidence1' };
			fileCacheMap.set(file.path, {
				frontmatter: {
					'nexuspm-type': 'evidence',
					'source-url': 'https://example.com/report',
					'source-type': 'external-report',
					'captured-at': '2024-03-10'
				},
				headings: [{ level: 1, heading: '市場調査レポート' }]
			});

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const evidence = parser.parseEvidence(file as any);
			expect(evidence).not.toBeNull();
			expect(evidence!.sourceUrl).toBe('https://example.com/report');
			expect(evidence!.sourceType).toBe('external-report');
			expect(evidence!.capturedAt).toBe('2024-03-10');
		});
	});

	describe('findProjectConfig', () => {
		it('should find decision-project note in folder', () => {
			fileCacheMap.set('project/_project.md', {
				frontmatter: {
					'nexuspm-type': 'decision-project',
					criteria: [{ key: 'cost', label: 'コスト', weight: 3 }]
				}
			});
			fileCacheMap.set('project/option1.md', {
				frontmatter: { 'nexuspm-type': 'option' }
			});

			const config = parser.findProjectConfig('project');
			expect(config.criteria).toHaveLength(1);
			expect(config.criteria[0].key).toBe('cost');
		});

		it('should prioritize _project prefixed file', () => {
			fileCacheMap.set('project/_project.md', {
				frontmatter: {
					'nexuspm-type': 'decision-project',
					criteria: [{ key: 'priority', label: '優先', weight: 5 }]
				}
			});
			fileCacheMap.set('project/other-project.md', {
				frontmatter: {
					'nexuspm-type': 'decision-project',
					criteria: [{ key: 'other', label: 'その他', weight: 1 }]
				}
			});

			const config = parser.findProjectConfig('project');
			expect(config.criteria[0].key).toBe('priority');
		});

		it('should return default config if no project note found', () => {
			fileCacheMap.set('project/option1.md', {
				frontmatter: { 'nexuspm-type': 'option' }
			});

			const config = parser.findProjectConfig('project');
			expect(config.criteria).toEqual([]);
			expect(config.scoringMissing).toBe('zero');
		});
	});

	describe('parseFolder', () => {
		it('should parse all decision items in folder', () => {
			fileCacheMap.set('project/_project.md', {
				frontmatter: {
					'nexuspm-type': 'decision-project',
					criteria: [{ key: 'cost', label: 'コスト', weight: 3 }]
				},
				headings: [{ level: 1, heading: 'My Project' }]
			});
			fileCacheMap.set('project/option1.md', {
				frontmatter: {
					'nexuspm-type': 'option',
					scores: { cost: 4 }
				},
				headings: [{ level: 1, heading: '候補1' }]
			});
			fileCacheMap.set('project/option2.md', {
				frontmatter: {
					'nexuspm-type': 'option',
					scores: { cost: 2 }
				},
				headings: [{ level: 1, heading: '候補2' }]
			});
			fileCacheMap.set('project/decision1.md', {
				frontmatter: {
					'nexuspm-type': 'decision',
					'decision-status': 'proposed'
				}
			});
			fileCacheMap.set('project/risk1.md', {
				frontmatter: {
					'nexuspm-type': 'risk',
					probability: 3,
					impact: 2
				}
			});

			const project = parser.parseFolder('project');
			expect(project.options.size).toBe(2);
			expect(project.decisions.size).toBe(1);
			expect(project.risks.size).toBe(1);
			expect(project.config.criteria).toHaveLength(1);
		});

		it('should ignore non-decision items', () => {
			fileCacheMap.set('project/regular-note.md', {
				frontmatter: { tags: ['note'] }
			});
			fileCacheMap.set('project/option1.md', {
				frontmatter: { 'nexuspm-type': 'option' }
			});

			const project = parser.parseFolder('project');
			expect(project.options.size).toBe(1);
		});
	});
});
