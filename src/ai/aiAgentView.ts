/**
 * AI Agent View - サイドパネルチャットUI
 * 
 * Obsidianの右サイドバーにチャットパネルを表示
 */

import { 
	ItemView, 
	WorkspaceLeaf, 
	App, 
	Setting, 
	TextAreaComponent,
	ButtonComponent,
	DropdownComponent,
	Notice,
	TFolder,
	setIcon
} from 'obsidian';
import { 
	ChatMessage, 
	ChatSession, 
	AIAgentSettings,
	DECISION_ORGANIZER_SYSTEM_PROMPT,
	generateMessageId,
	createEmptySession
} from './aiAgentDataModel';
import { createLLMProvider, LLMProviderInterface, LLMResponse } from './llmProvider';
import { AgentToolExecutor, AGENT_TOOLS, executeToolCalls } from './agentTools';

export const AI_AGENT_VIEW_TYPE = 'nexuspm-ai-agent-view';

export class AIAgentView extends ItemView {
	private settings: AIAgentSettings;
	private session: ChatSession;
	private provider: LLMProviderInterface | null = null;
	private toolExecutor: AgentToolExecutor;
	private isProcessing = false;

	// UI要素
	private messagesContainer: HTMLElement;
	private inputTextarea: TextAreaComponent;
	private sendButton: ButtonComponent;
	private folderSelector: DropdownComponent;

	constructor(leaf: WorkspaceLeaf, settings: AIAgentSettings) {
		super(leaf);
		this.settings = settings;
		this.session = createEmptySession();
		this.toolExecutor = new AgentToolExecutor(this.app);
	}

	getViewType(): string {
		return AI_AGENT_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'AI Agent';
	}

	getIcon(): string {
		return 'bot';
	}

	/**
	 * 設定を更新
	 */
	updateSettings(settings: AIAgentSettings): void {
		this.settings = settings;
		this.provider = null; // プロバイダーをリセット
	}

	/**
	 * ターゲットフォルダを設定
	 */
	setTargetFolder(folder: string): void {
		this.session.targetFolder = folder;
		this.toolExecutor.setTargetFolder(folder);
		
		// フォルダセレクターを更新
		if (this.folderSelector) {
			this.folderSelector.setValue(folder);
		}
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass('nexuspm-ai-agent-container');

		// ヘッダー
		this.createHeader(container);

		// メッセージ表示エリア
		this.messagesContainer = container.createDiv({ cls: 'nexuspm-ai-messages' });

		// 入力エリア
		this.createInputArea(container);

		// 初期メッセージ表示
		this.renderMessages();
	}

	async onClose(): Promise<void> {
		// クリーンアップ
	}

	/**
	 * ヘッダーを作成
	 */
	private createHeader(container: Element): void {
		const header = container.createDiv({ cls: 'nexuspm-ai-header' });

		// タイトル
		header.createEl('h4', { text: 'AI Agent' });

		// フォルダ選択
		const folderRow = header.createDiv({ cls: 'nexuspm-ai-folder-row' });
		folderRow.createSpan({ text: '対象フォルダ: ' });

		const folderSelect = folderRow.createEl('select', { cls: 'nexuspm-ai-folder-select' });
		this.folderSelector = new DropdownComponent(folderSelect);

		// フォルダ一覧を取得
		this.populateFolderOptions();

		this.folderSelector.onChange((value) => {
			this.session.targetFolder = value || undefined;
			this.toolExecutor.setTargetFolder(value);
		});

		// アクションボタン
		const actions = header.createDiv({ cls: 'nexuspm-ai-actions' });

		// 新しいチャット
		const newChatBtn = actions.createEl('button', { 
			cls: 'nexuspm-ai-action-btn',
			attr: { 'aria-label': '新しいチャット' }
		});
		setIcon(newChatBtn, 'plus');
		newChatBtn.addEventListener('click', () => this.startNewChat());

		// クリア
		const clearBtn = actions.createEl('button', { 
			cls: 'nexuspm-ai-action-btn',
			attr: { 'aria-label': 'チャットをクリア' }
		});
		setIcon(clearBtn, 'trash');
		clearBtn.addEventListener('click', () => this.clearChat());
	}

	/**
	 * フォルダオプションを設定
	 */
	private populateFolderOptions(): void {
		this.folderSelector.addOption('', '(Vaultルート)');

		const folders = this.getAllFolders();
		for (const folder of folders) {
			this.folderSelector.addOption(folder, folder);
		}

		if (this.session.targetFolder) {
			this.folderSelector.setValue(this.session.targetFolder);
		}
	}

	/**
	 * 全フォルダを取得
	 */
	private getAllFolders(): string[] {
		const folders: string[] = [];
		
		const collectFolders = (folder: TFolder) => {
			if (folder.path) {
				folders.push(folder.path);
			}
			for (const child of folder.children) {
				if (child instanceof TFolder) {
					collectFolders(child);
				}
			}
		};

		collectFolders(this.app.vault.getRoot());
		return folders.sort();
	}

	/**
	 * 入力エリアを作成
	 */
	private createInputArea(container: Element): void {
		const inputArea = container.createDiv({ cls: 'nexuspm-ai-input-area' });

		// テキストエリア
		const textareaContainer = inputArea.createDiv({ cls: 'nexuspm-ai-textarea-container' });
		this.inputTextarea = new TextAreaComponent(textareaContainer);
		this.inputTextarea.inputEl.addClass('nexuspm-ai-textarea');
		this.inputTextarea.setPlaceholder('メッセージを入力...');
		this.inputTextarea.inputEl.rows = 3;

		// Enterで送信（Shift+Enterで改行）
		this.inputTextarea.inputEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				this.sendMessage();
			}
		});

		// 送信ボタン
		const buttonContainer = inputArea.createDiv({ cls: 'nexuspm-ai-button-container' });
		this.sendButton = new ButtonComponent(buttonContainer);
		this.sendButton.setButtonText('送信');
		this.sendButton.setCta();
		this.sendButton.onClick(() => this.sendMessage());
	}

	/**
	 * メッセージを表示
	 */
	private renderMessages(): void {
		this.messagesContainer.empty();

		if (this.session.messages.length === 0) {
			const placeholder = this.messagesContainer.createDiv({ cls: 'nexuspm-ai-placeholder' });
			placeholder.createEl('p', { text: 'Decision Projectの整理をお手伝いします。' });
			placeholder.createEl('p', { text: 'メモを分析して、選択肢やリスクへの昇格を提案できます。' });
			placeholder.createEl('p', { text: '対象フォルダを選択して、メッセージを送信してください。' });
			return;
		}

		for (const message of this.session.messages) {
			this.renderMessage(message);
		}

		// 最新メッセージにスクロール
		this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
	}

	/**
	 * 単一メッセージを表示
	 */
	private renderMessage(message: ChatMessage): void {
		const messageEl = this.messagesContainer.createDiv({
			cls: `nexuspm-ai-message nexuspm-ai-message-${message.role}`
		});

		// 役割ラベル
		const roleLabel = message.role === 'user' ? 'あなた' : 'AI';
		messageEl.createDiv({ cls: 'nexuspm-ai-message-role', text: roleLabel });

		// コンテンツ
		const contentEl = messageEl.createDiv({ cls: 'nexuspm-ai-message-content' });
		contentEl.innerHTML = this.formatContent(message.content);

		// ツール呼び出し表示
		if (message.toolCalls && message.toolCalls.length > 0) {
			const toolsEl = messageEl.createDiv({ cls: 'nexuspm-ai-tool-calls' });
			toolsEl.createEl('small', { text: '実行したツール:' });
			for (const tc of message.toolCalls) {
				const toolEl = toolsEl.createDiv({ cls: 'nexuspm-ai-tool-call' });
				toolEl.createEl('code', { text: tc.name });
			}
		}

		// ツール結果表示
		if (message.toolResults && message.toolResults.length > 0) {
			const resultsEl = messageEl.createDiv({ cls: 'nexuspm-ai-tool-results' });
			for (const tr of message.toolResults) {
				const resultEl = resultsEl.createDiv({ cls: 'nexuspm-ai-tool-result' });
				if (tr.error) {
					resultEl.addClass('nexuspm-ai-tool-error');
					resultEl.createEl('small', { text: `${tr.name}: エラー - ${tr.error}` });
				} else {
					resultEl.createEl('small', { text: `${tr.name}: 成功` });
				}
			}
		}
	}

	/**
	 * コンテンツをフォーマット
	 */
	private formatContent(content: string): string {
		// 簡易的なMarkdown変換
		return content
			.replace(/\n/g, '<br>')
			.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
			.replace(/\*(.*?)\*/g, '<em>$1</em>')
			.replace(/`(.*?)`/g, '<code>$1</code>');
	}

	/**
	 * メッセージ送信
	 */
	private async sendMessage(): Promise<void> {
		const content = this.inputTextarea.getValue().trim();
		if (!content || this.isProcessing) return;

		// ユーザーメッセージを追加
		const userMessage: ChatMessage = {
			id: generateMessageId(),
			role: 'user',
			content,
			timestamp: new Date()
		};
		this.session.messages.push(userMessage);
		this.session.updatedAt = new Date();

		// 入力をクリア
		this.inputTextarea.setValue('');

		// UI更新
		this.renderMessages();

		// 処理開始
		this.isProcessing = true;
		this.sendButton.setDisabled(true);
		this.sendButton.setButtonText('処理中...');

		try {
			await this.processWithLLM();
		} catch (error) {
			new Notice(`エラー: ${error instanceof Error ? error.message : String(error)}`);
			
			// エラーメッセージを追加
			const errorMessage: ChatMessage = {
				id: generateMessageId(),
				role: 'assistant',
				content: `エラーが発生しました: ${error instanceof Error ? error.message : String(error)}`,
				timestamp: new Date()
			};
			this.session.messages.push(errorMessage);
		} finally {
			this.isProcessing = false;
			this.sendButton.setDisabled(false);
			this.sendButton.setButtonText('送信');
			this.renderMessages();
		}
	}

	/**
	 * LLMで処理
	 */
	private async processWithLLM(): Promise<void> {
		// プロバイダーを初期化
		if (!this.provider) {
			this.provider = createLLMProvider(this.settings);
		}

		// 利用可能かチェック
		const available = await this.provider.isAvailable();
		if (!available) {
			throw new Error(`${this.settings.provider}プロバイダーが利用できません。API Keyを確認してください。`);
		}

		// システムプロンプト
		const systemPrompt = this.settings.systemPrompt || DECISION_ORGANIZER_SYSTEM_PROMPT;

		// ツールループ（最大5回）
		let iteration = 0;
		const maxIterations = 5;

		while (iteration < maxIterations) {
			iteration++;

			// LLMを呼び出し
			const response = await this.provider.chat(
				this.session.messages,
				AGENT_TOOLS,
				systemPrompt
			);

			// アシスタントメッセージを作成
			const assistantMessage: ChatMessage = {
				id: generateMessageId(),
				role: 'assistant',
				content: response.content,
				timestamp: new Date(),
				toolCalls: response.toolCalls
			};

			// ツール呼び出しがある場合
			if (response.toolCalls && response.toolCalls.length > 0) {
				// ツールを実行
				const toolResults = await executeToolCalls(this.toolExecutor, response.toolCalls);
				assistantMessage.toolResults = toolResults;

				// メッセージを追加
				this.session.messages.push(assistantMessage);
				this.renderMessages();

				// ツール結果を含めて続行
				continue;
			}

			// ツール呼び出しがない場合は終了
			this.session.messages.push(assistantMessage);
			break;
		}

		this.session.updatedAt = new Date();
	}

	/**
	 * 新しいチャットを開始
	 */
	private startNewChat(): void {
		const targetFolder = this.session.targetFolder;
		this.session = createEmptySession(targetFolder);
		this.renderMessages();
		new Notice('新しいチャットを開始しました');
	}

	/**
	 * チャットをクリア
	 */
	private clearChat(): void {
		this.session.messages = [];
		this.session.updatedAt = new Date();
		this.renderMessages();
	}
}

/**
 * AIエージェントビューを開く
 */
export async function activateAIAgentView(app: App, settings: AIAgentSettings): Promise<AIAgentView> {
	const { workspace } = app;

	let leaf = workspace.getLeavesOfType(AI_AGENT_VIEW_TYPE)[0];

	if (!leaf) {
		const rightLeaf = workspace.getRightLeaf(false);
		if (rightLeaf) {
			leaf = rightLeaf;
			await leaf.setViewState({
				type: AI_AGENT_VIEW_TYPE,
				active: true
			});
		}
	}

	if (leaf) {
		workspace.revealLeaf(leaf);
		return leaf.view as AIAgentView;
	}

	throw new Error('Could not create AI Agent view');
}
