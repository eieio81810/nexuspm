/**
 * Decision Renderer
 * 
 * Decision Project関連のHTMLレンダリング
 */
import {
	DecisionProject,
	DecisionOption,
	Decision,
	Risk,
	Assumption,
	Evidence,
	Memo,
	Criterion
} from './decisionDataModel';
import { getRiskLevel, getRiskLevelColor, getRiskLevelLabel, getTopRisks } from './riskModel';

/**
 * 意思決定ステータスのラベル
 */
const DECISION_STATUS_LABELS: Record<string, string> = {
	proposed: '提案中',
	decided: '決定済み',
	superseded: '上書き済み'
};

/**
 * 意思決定ステータスの色
 */
const DECISION_STATUS_COLORS: Record<string, string> = {
	proposed: '#f59e0b',  // amber
	decided: '#22c55e',   // green
	superseded: '#9ca3af' // gray
};

export class DecisionRenderer {
	/**
	 * Memosテーブルをレンダリング
	 */
	renderMemosTable(memos: Memo[]): string {
		if (memos.length === 0) {
			return '<div class="decision-empty">メモがありません</div>';
		}

		const headerRow = '<tr><th>タイトル</th><th>タグ</th><th>昇格</th></tr>';

		const rows = memos.map(memo => {
			const tags = memo.tags.length > 0 
				? memo.tags.map(t => `<span class="memo-tag">${this.escapeHtml(t)}</span>`).join(' ')
				: '-';

			const promoteOptions = [
				{ value: '', label: '-- 選択 --' },
				{ value: 'option', label: '選択肢' },
				{ value: 'risk', label: 'リスク' },
				{ value: 'assumption', label: '仮説' },
				{ value: 'evidence', label: '根拠' }
			];
			const promoteSelect = promoteOptions.map(opt => 
				`<option value="${opt.value}" ${memo.promoteToType === opt.value ? 'selected' : ''}>${opt.label}</option>`
			).join('');

			return `
				<tr>
					<td class="title-cell">
						<a class="decision-title-link" data-file-path="${this.escapeHtml(memo.id)}" href="#">
							${this.escapeHtml(memo.title)}
						</a>
					</td>
					<td class="tags-cell">${tags}</td>
					<td class="promote-cell">
						<select class="memo-promote-select" data-file-path="${this.escapeHtml(memo.id)}">
							${promoteSelect}
						</select>
						<button class="memo-promote-btn" data-file-path="${this.escapeHtml(memo.id)}" title="昇格実行">
							→
						</button>
					</td>
				</tr>
			`;
		}).join('');

		return `
			<table class="decision-table memos-table">
				<thead>${headerRow}</thead>
				<tbody>${rows}</tbody>
			</table>
		`;
	}

	/**
	 * Optionsテーブルをレンダリング
	 */
	renderOptionsTable(options: DecisionOption[], criteria: Criterion[]): string {
		if (options.length === 0) {
			return '<div class="decision-empty">選択肢がありません</div>';
		}

		// ランク順にソート
		const sorted = [...options].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));

		const criteriaHeaders = criteria.map(c => `<th>${this.escapeHtml(c.label)}</th>`).join('');
		const headerRow = `<tr><th>順位</th><th>タイトル</th><th>総合点</th>${criteriaHeaders}</tr>`;

		const rows = sorted.map(option => {
			const scoreCells = criteria.map(c => {
				const score = option.scores[c.key] ?? '-';
				return `<td class="score-cell">${score}</td>`;
			}).join('');

			return `
				<tr>
					<td class="rank-cell">${option.rank ?? '-'}</td>
					<td class="title-cell">
						<a class="decision-title-link" data-file-path="${this.escapeHtml(option.id)}" href="#">
							${this.escapeHtml(option.title)}
						</a>
					</td>
					<td class="total-score-cell">${option.totalScore ?? 0}</td>
					${scoreCells}
				</tr>
			`;
		}).join('');

		return `
			<table class="decision-table options-table">
				<thead>${headerRow}</thead>
				<tbody>${rows}</tbody>
			</table>
		`;
	}

	/**
	 * Decisionsテーブルをレンダリング
	 */
	renderDecisionsTable(decisions: Decision[]): string {
		if (decisions.length === 0) {
			return '<div class="decision-empty">意思決定ログがありません</div>';
		}

		const headerRow = '<tr><th>タイトル</th><th>状態</th><th>決定日</th><th>選択肢</th><th>選択結果</th></tr>';

		const rows = decisions.map(decision => {
			const statusLabel = DECISION_STATUS_LABELS[decision.decisionStatus] || decision.decisionStatus;
			const statusColor = DECISION_STATUS_COLORS[decision.decisionStatus] || '#6b7280';
			const optionsList = decision.options.length > 0 
				? decision.options.map(o => this.escapeHtml(o)).join(', ')
				: '-';
			const chosen = decision.chosen ? this.escapeHtml(decision.chosen) : '-';
			const date = decision.decisionDate || '-';

			return `
				<tr>
					<td class="title-cell">
						<a class="decision-title-link" data-file-path="${this.escapeHtml(decision.id)}" href="#">
							${this.escapeHtml(decision.title)}
						</a>
					</td>
					<td class="status-cell">
						<span class="decision-status-badge" style="background-color: ${statusColor}">
							${statusLabel}
						</span>
					</td>
					<td class="date-cell">${date}</td>
					<td class="options-cell">${optionsList}</td>
					<td class="chosen-cell">${chosen}</td>
				</tr>
			`;
		}).join('');

		return `
			<table class="decision-table decisions-table">
				<thead>${headerRow}</thead>
				<tbody>${rows}</tbody>
			</table>
		`;
	}

	/**
	 * Risksテーブルをレンダリング
	 */
	renderRisksTable(risks: Risk[]): string {
		if (risks.length === 0) {
			return '<div class="decision-empty">リスクがありません</div>';
		}

		// exposure降順でソート
		const sorted = [...risks].sort((a, b) => b.exposure - a.exposure);

		const headerRow = '<tr><th>タイトル</th><th>確率</th><th>影響</th><th>露出</th><th>レベル</th><th>対策</th><th>担当</th><th>期限</th></tr>';

		const rows = sorted.map(risk => {
			const level = getRiskLevel(risk.exposure);
			const levelColor = getRiskLevelColor(level);
			const levelLabel = getRiskLevelLabel(level);
			const mitigation = risk.mitigation ? this.escapeHtml(risk.mitigation) : '-';
			const owner = risk.owner ? this.escapeHtml(risk.owner) : '-';
			const dueDate = risk.dueDate || '-';

			return `
				<tr>
					<td class="title-cell">
						<a class="decision-title-link" data-file-path="${this.escapeHtml(risk.id)}" href="#">
							${this.escapeHtml(risk.title)}
						</a>
					</td>
					<td class="prob-cell">${risk.probability}</td>
					<td class="impact-cell">${risk.impact}</td>
					<td class="exposure-cell">${risk.exposure}</td>
					<td class="level-cell">
						<span class="risk-level-badge" style="background-color: ${levelColor}">
							${levelLabel}
						</span>
					</td>
					<td class="mitigation-cell">${mitigation}</td>
					<td class="owner-cell">${owner}</td>
					<td class="due-date-cell">${dueDate}</td>
				</tr>
			`;
		}).join('');

		return `
			<table class="decision-table risks-table">
				<thead>${headerRow}</thead>
				<tbody>${rows}</tbody>
			</table>
		`;
	}

	/**
	 * Assumptionsテーブルをレンダリング
	 */
	renderAssumptionsTable(assumptions: Assumption[]): string {
		if (assumptions.length === 0) {
			return '<div class="decision-empty">仮説がありません</div>';
		}

		const statusLabels: Record<string, string> = {
			'untested': '未検証',
			'testing': '検証中',
			'validated': '確証',
			'falsified': '反証'
		};

		const statusColors: Record<string, string> = {
			'untested': '#9ca3af',
			'testing': '#f59e0b',
			'validated': '#22c55e',
			'falsified': '#ef4444'
		};

		const headerRow = '<tr><th>タイトル</th><th>ステータス</th><th>エビデンス数</th></tr>';

		const rows = assumptions.map(assumption => {
			const statusLabel = statusLabels[assumption.assumptionStatus] || assumption.assumptionStatus;
			const statusColor = statusColors[assumption.assumptionStatus] || '#6b7280';
			const evidenceCount = assumption.evidence.length;

			return `
				<tr>
					<td class="title-cell">
						<a class="decision-title-link" data-file-path="${this.escapeHtml(assumption.id)}" href="#">
							${this.escapeHtml(assumption.title)}
						</a>
					</td>
					<td class="status-cell">
						<span class="assumption-status-badge" style="background-color: ${statusColor}">
							${statusLabel}
						</span>
					</td>
					<td class="evidence-count-cell">${evidenceCount}</td>
				</tr>
			`;
		}).join('');

		return `
			<table class="decision-table assumptions-table">
				<thead>${headerRow}</thead>
				<tbody>${rows}</tbody>
			</table>
		`;
	}

	/**
	 * Evidencesテーブルをレンダリング
	 */
	renderEvidencesTable(evidences: Evidence[]): string {
		if (evidences.length === 0) {
			return '<div class="decision-empty">エビデンスがありません</div>';
		}

		const headerRow = '<tr><th>タイトル</th><th>ソース種別</th><th>取得日</th><th>URL</th></tr>';

		const rows = evidences.map(evidence => {
			const sourceType = evidence.sourceType ? this.escapeHtml(evidence.sourceType) : '-';
			const capturedAt = evidence.capturedAt || '-';
			const sourceUrl = evidence.sourceUrl
				? `<a href="${this.escapeHtml(evidence.sourceUrl)}" target="_blank" rel="noopener" class="evidence-url-link">🔗 開く</a>`
				: '-';

			return `
				<tr>
					<td class="title-cell">
						<a class="decision-title-link" data-file-path="${this.escapeHtml(evidence.id)}" href="#">
							${this.escapeHtml(evidence.title)}
						</a>
					</td>
					<td class="source-type-cell">${sourceType}</td>
					<td class="captured-at-cell">${capturedAt}</td>
					<td class="source-url-cell">${sourceUrl}</td>
				</tr>
			`;
		}).join('');

		return `
			<table class="decision-table evidences-table">
				<thead>${headerRow}</thead>
				<tbody>${rows}</tbody>
			</table>
		`;
	}

	/**
	 * プロジェクト概要をレンダリング
	 */
	renderOverview(project: DecisionProject): string {
		const memosCount = project.memos.size;
		const optionsCount = project.options.size;
		const assumptionsCount = project.assumptions.size;
		const evidencesCount = project.evidences.size;
		const pendingDecisions = Array.from(project.decisions.values())
			.filter(d => d.decisionStatus === 'proposed');
		const topRisks = getTopRisks(project.risks, 3);

		// 未検証の仮説
		const untestedAssumptions = Array.from(project.assumptions.values())
			.filter(a => a.assumptionStatus === 'untested' || a.assumptionStatus === 'testing');

		const pendingDecisionsHtml = pendingDecisions.length > 0
			? pendingDecisions.map(d => `
				<li>
					<a class="decision-title-link" data-file-path="${this.escapeHtml(d.id)}" href="#">
						${this.escapeHtml(d.title)}
					</a>
				</li>
			`).join('')
			: '<li class="empty-item">なし</li>';

		const topRisksHtml = topRisks.length > 0
			? topRisks.map(r => {
				const level = getRiskLevel(r.exposure);
				const levelColor = getRiskLevelColor(level);
				return `
					<li>
						<span class="risk-level-dot" style="background-color: ${levelColor}"></span>
						<a class="decision-title-link" data-file-path="${this.escapeHtml(r.id)}" href="#">
							${this.escapeHtml(r.title)}
						</a>
						<span class="risk-exposure">(${r.exposure})</span>
					</li>
				`;
			}).join('')
			: '<li class="empty-item">なし</li>';

		const untestedAssumptionsHtml = untestedAssumptions.length > 0
			? untestedAssumptions.map(a => {
				const statusLabel = a.assumptionStatus === 'testing' ? '検証中' : '未検証';
				return `
					<li>
						<span class="assumption-status-dot ${a.assumptionStatus}"></span>
						<a class="decision-title-link" data-file-path="${this.escapeHtml(a.id)}" href="#">
							${this.escapeHtml(a.title)}
						</a>
						<span class="assumption-status-label">(${statusLabel})</span>
					</li>
				`;
			}).join('')
			: '<li class="empty-item">なし</li>';

		return `
			<div class="decision-overview">
				<h2>${this.escapeHtml(project.name)}</h2>
				
				<div class="overview-stats">
					<div class="stat-card">
						<div class="stat-value">${memosCount}</div>
						<div class="stat-label">メモ</div>
					</div>
					<div class="stat-card">
						<div class="stat-value">${optionsCount}</div>
						<div class="stat-label">選択肢</div>
					</div>
					<div class="stat-card">
						<div class="stat-value">${pendingDecisions.length}</div>
						<div class="stat-label">未決の意思決定</div>
					</div>
					<div class="stat-card">
						<div class="stat-value">${project.risks.size}</div>
						<div class="stat-label">リスク</div>
					</div>
					<div class="stat-card">
						<div class="stat-value">${assumptionsCount}</div>
						<div class="stat-label">仮説</div>
					</div>
					<div class="stat-card">
						<div class="stat-value">${evidencesCount}</div>
						<div class="stat-label">エビデンス</div>
					</div>
				</div>

				<div class="overview-sections">
					<div class="overview-section">
						<h3>未決の意思決定</h3>
						<ul class="overview-list">${pendingDecisionsHtml}</ul>
					</div>
					<div class="overview-section">
						<h3>上位リスク</h3>
						<ul class="overview-list risks-list">${topRisksHtml}</ul>
					</div>
					<div class="overview-section">
						<h3>要検証の仮説</h3>
						<ul class="overview-list assumptions-list">${untestedAssumptionsHtml}</ul>
					</div>
				</div>
			</div>
		`;
	}

	/**
	 * HTMLエスケープ
	 */
	private escapeHtml(text: string): string {
		const map: Record<string, string> = {
			'&': '&amp;',
			'<': '&lt;',
			'>': '&gt;',
			'"': '&quot;',
			"'": '&#039;'
		};
		return text.replace(/[&<>"']/g, char => map[char]);
	}
}
