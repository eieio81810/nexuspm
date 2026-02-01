/**
 * AI Agent Data Model
 * 
 * AIエージェント機能のデータ構造定義
 */

/**
 * サポートするLLMプロバイダー
 */
export type LLMProvider = 'openai' | 'anthropic' | 'ollama';

/**
 * チャットメッセージの役割
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * チャットメッセージ
 */
export interface ChatMessage {
	id: string;
	role: MessageRole;
	content: string;
	timestamp: Date;
	/** ツール呼び出しの結果（アシスタントのみ） */
	toolCalls?: ToolCall[];
	/** ツール結果（アシスタントが使用） */
	toolResults?: ToolResult[];
}

/**
 * ツール呼び出し
 */
export interface ToolCall {
	id: string;
	name: string;
	arguments: Record<string, unknown>;
}

/**
 * ツール実行結果
 */
export interface ToolResult {
	callId: string;
	name: string;
	result: string;
	error?: string;
}

/**
 * チャットセッション
 */
export interface ChatSession {
	id: string;
	title: string;
	messages: ChatMessage[];
	/** 対象フォルダ（指定がある場合） */
	targetFolder?: string;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * AIエージェントの設定
 */
export interface AIAgentSettings {
	/** 有効なプロバイダー */
	provider: LLMProvider;
	/** OpenAI API Key */
	openaiApiKey?: string;
	/** OpenAIモデル名 */
	openaiModel?: string;
	/** Anthropic API Key */
	anthropicApiKey?: string;
	/** Anthropicモデル名 */
	anthropicModel?: string;
	/** OllamaベースURL */
	ollamaBaseUrl?: string;
	/** Ollamaモデル名 */
	ollamaModel?: string;
	/** システムプロンプト（カスタマイズ用） */
	systemPrompt?: string;
	/** 最大トークン数 */
	maxTokens?: number;
	/** 温度パラメータ */
	temperature?: number;
}

/**
 * デフォルトのAIエージェント設定
 */
export const DEFAULT_AI_AGENT_SETTINGS: AIAgentSettings = {
	provider: 'openai',
	openaiModel: 'gpt-4o',
	anthropicModel: 'claude-sonnet-4-20250514',
	ollamaBaseUrl: 'http://localhost:11434',
	ollamaModel: 'llama3.2',
	maxTokens: 4096,
	temperature: 0.7
};

/**
 * ツール定義
 */
export interface ToolDefinition {
	name: string;
	description: string;
	parameters: {
		type: 'object';
		properties: Record<string, {
			type: string;
			description: string;
			enum?: string[];
		}>;
		required: string[];
	};
}

/**
 * Decision Project整理用のシステムプロンプト
 */
export const DECISION_ORGANIZER_SYSTEM_PROMPT = `あなたはObsidianのDecision Projectを整理するAIアシスタントです。

あなたの役割:
1. ユーザーが収集したメモを分析し、構造化する
2. メモから選択肢、リスク、仮説、エビデンスを抽出・提案する
3. 適切な評価軸（criteria）を提案する
4. ノートのfrontmatterを更新してタイプを変更する

作業時の注意:
- 常に日本語で回答してください
- ファイルを操作する前に、ユーザーに確認を取ってください
- 一度に大量の変更を行わず、段階的に進めてください
- 変更内容を明確に説明してください

利用可能なツール:
- list_files: フォルダ内のファイル一覧を取得
- read_file: ファイルの内容を読み取る
- update_frontmatter: ファイルのfrontmatterを更新
- create_file: 新しいファイルを作成

フォルダの指定がない場合は、Obsidianのルートフォルダから操作します。`;

/**
 * メッセージIDを生成
 */
export function generateMessageId(): string {
	return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * セッションIDを生成
 */
export function generateSessionId(): string {
	return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 空のチャットセッションを作成
 */
export function createEmptySession(targetFolder?: string): ChatSession {
	return {
		id: generateSessionId(),
		title: '新しいチャット',
		messages: [],
		targetFolder,
		createdAt: new Date(),
		updatedAt: new Date()
	};
}
