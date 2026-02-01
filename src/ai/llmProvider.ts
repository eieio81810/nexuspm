/**
 * LLM Provider Abstraction Layer
 * 
 * OpenAI, Anthropic, Ollamaの3つのプロバイダーをサポート
 */

import { requestUrl, RequestUrlParam } from 'obsidian';
import { 
	LLMProvider, 
	ChatMessage, 
	ToolCall, 
	ToolDefinition, 
	AIAgentSettings 
} from './aiAgentDataModel';

/**
 * LLMレスポンス
 */
export interface LLMResponse {
	content: string;
	toolCalls?: ToolCall[];
	finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
	usage?: {
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
	};
}

/**
 * ストリーミングチャンク
 */
export interface StreamChunk {
	content?: string;
	toolCall?: Partial<ToolCall>;
	done: boolean;
}

/**
 * LLMプロバイダーインターフェース
 */
export interface LLMProviderInterface {
	/**
	 * チャット補完を実行
	 */
	chat(
		messages: ChatMessage[],
		tools?: ToolDefinition[],
		systemPrompt?: string
	): Promise<LLMResponse>;

	/**
	 * ストリーミングチャット補完を実行
	 */
	chatStream(
		messages: ChatMessage[],
		tools?: ToolDefinition[],
		systemPrompt?: string,
		onChunk?: (chunk: StreamChunk) => void
	): Promise<LLMResponse>;

	/**
	 * プロバイダーが利用可能かチェック
	 */
	isAvailable(): Promise<boolean>;
}

/**
 * OpenAIプロバイダー
 */
export class OpenAIProvider implements LLMProviderInterface {
	private apiKey: string;
	private model: string;
	private maxTokens: number;
	private temperature: number;

	constructor(settings: AIAgentSettings) {
		this.apiKey = settings.openaiApiKey || '';
		this.model = settings.openaiModel || 'gpt-4o';
		this.maxTokens = settings.maxTokens || 4096;
		this.temperature = settings.temperature || 0.7;
	}

	async isAvailable(): Promise<boolean> {
		return !!this.apiKey;
	}

	async chat(
		messages: ChatMessage[],
		tools?: ToolDefinition[],
		systemPrompt?: string
	): Promise<LLMResponse> {
		const openaiMessages = this.convertMessages(messages, systemPrompt);
		const openaiTools = tools ? this.convertTools(tools) : undefined;

		const body: Record<string, unknown> = {
			model: this.model,
			messages: openaiMessages,
			max_tokens: this.maxTokens,
			temperature: this.temperature
		};

		if (openaiTools && openaiTools.length > 0) {
			body.tools = openaiTools;
			body.tool_choice = 'auto';
		}

		const response = await requestUrl({
			url: 'https://api.openai.com/v1/chat/completions',
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${this.apiKey}`
			},
			body: JSON.stringify(body)
		});

		return this.parseResponse(response.json);
	}

	async chatStream(
		messages: ChatMessage[],
		tools?: ToolDefinition[],
		systemPrompt?: string,
		onChunk?: (chunk: StreamChunk) => void
	): Promise<LLMResponse> {
		// Obsidianのリクエストではストリーミングが難しいため、
		// 通常のリクエストを使用し、完了後にコールバックを呼ぶ
		const response = await this.chat(messages, tools, systemPrompt);
		
		if (onChunk) {
			onChunk({ content: response.content, done: true });
		}
		
		return response;
	}

	private convertMessages(messages: ChatMessage[], systemPrompt?: string): unknown[] {
		const result: unknown[] = [];

		if (systemPrompt) {
			result.push({ role: 'system', content: systemPrompt });
		}

		for (const msg of messages) {
			if (msg.role === 'system') continue; // システムプロンプトは上で処理

			const openaiMsg: Record<string, unknown> = {
				role: msg.role,
				content: msg.content
			};

			// ツール呼び出しの結果を含める
			if (msg.toolCalls && msg.toolCalls.length > 0) {
				openaiMsg.tool_calls = msg.toolCalls.map(tc => ({
					id: tc.id,
					type: 'function',
					function: {
						name: tc.name,
						arguments: JSON.stringify(tc.arguments)
					}
				}));
			}

			result.push(openaiMsg);

			// ツール結果を追加
			if (msg.toolResults) {
				for (const tr of msg.toolResults) {
					result.push({
						role: 'tool',
						tool_call_id: tr.callId,
						content: tr.error || tr.result
					});
				}
			}
		}

		return result;
	}

	private convertTools(tools: ToolDefinition[]): unknown[] {
		return tools.map(tool => ({
			type: 'function',
			function: {
				name: tool.name,
				description: tool.description,
				parameters: tool.parameters
			}
		}));
	}

	private parseResponse(json: Record<string, unknown>): LLMResponse {
		const choice = (json.choices as unknown[])?.[0] as Record<string, unknown> | undefined;
		const message = choice?.message as Record<string, unknown> | undefined;
		const finishReason = choice?.finish_reason as string;

		let toolCalls: ToolCall[] | undefined;
		const rawToolCalls = message?.tool_calls as unknown[] | undefined;
		
		if (rawToolCalls && rawToolCalls.length > 0) {
			toolCalls = rawToolCalls.map((tc: unknown) => {
				const toolCall = tc as Record<string, unknown>;
				const fn = toolCall.function as Record<string, unknown>;
				return {
					id: toolCall.id as string,
					name: fn.name as string,
					arguments: JSON.parse(fn.arguments as string)
				};
			});
		}

		const usage = json.usage as Record<string, number> | undefined;

		return {
			content: (message?.content as string) || '',
			toolCalls,
			finishReason: finishReason === 'tool_calls' ? 'tool_calls' : 
				finishReason === 'length' ? 'length' : 'stop',
			usage: usage ? {
				promptTokens: usage.prompt_tokens,
				completionTokens: usage.completion_tokens,
				totalTokens: usage.total_tokens
			} : undefined
		};
	}
}

/**
 * Anthropicプロバイダー
 */
export class AnthropicProvider implements LLMProviderInterface {
	private apiKey: string;
	private model: string;
	private maxTokens: number;
	private temperature: number;

	constructor(settings: AIAgentSettings) {
		this.apiKey = settings.anthropicApiKey || '';
		this.model = settings.anthropicModel || 'claude-sonnet-4-20250514';
		this.maxTokens = settings.maxTokens || 4096;
		this.temperature = settings.temperature || 0.7;
	}

	async isAvailable(): Promise<boolean> {
		return !!this.apiKey;
	}

	async chat(
		messages: ChatMessage[],
		tools?: ToolDefinition[],
		systemPrompt?: string
	): Promise<LLMResponse> {
		const anthropicMessages = this.convertMessages(messages);
		const anthropicTools = tools ? this.convertTools(tools) : undefined;

		const body: Record<string, unknown> = {
			model: this.model,
			messages: anthropicMessages,
			max_tokens: this.maxTokens,
			temperature: this.temperature
		};

		if (systemPrompt) {
			body.system = systemPrompt;
		}

		if (anthropicTools && anthropicTools.length > 0) {
			body.tools = anthropicTools;
		}

		const response = await requestUrl({
			url: 'https://api.anthropic.com/v1/messages',
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': this.apiKey,
				'anthropic-version': '2023-06-01'
			},
			body: JSON.stringify(body)
		});

		return this.parseResponse(response.json);
	}

	async chatStream(
		messages: ChatMessage[],
		tools?: ToolDefinition[],
		systemPrompt?: string,
		onChunk?: (chunk: StreamChunk) => void
	): Promise<LLMResponse> {
		// 通常のリクエストを使用
		const response = await this.chat(messages, tools, systemPrompt);
		
		if (onChunk) {
			onChunk({ content: response.content, done: true });
		}
		
		return response;
	}

	private convertMessages(messages: ChatMessage[]): unknown[] {
		const result: unknown[] = [];

		for (const msg of messages) {
			if (msg.role === 'system') continue;

			const content: unknown[] = [];

			// テキストコンテンツを追加
			if (msg.content) {
				content.push({ type: 'text', text: msg.content });
			}

			// ツール結果を追加
			if (msg.toolResults) {
				for (const tr of msg.toolResults) {
					content.push({
						type: 'tool_result',
						tool_use_id: tr.callId,
						content: tr.error || tr.result
					});
				}
			}

			// ツール呼び出しを追加（assistant roleのみ）
			if (msg.role === 'assistant' && msg.toolCalls) {
				for (const tc of msg.toolCalls) {
					content.push({
						type: 'tool_use',
						id: tc.id,
						name: tc.name,
						input: tc.arguments
					});
				}
			}

			result.push({
				role: msg.role,
				content: content.length === 1 && (content[0] as Record<string, unknown>).type === 'text' 
					? msg.content 
					: content
			});
		}

		return result;
	}

	private convertTools(tools: ToolDefinition[]): unknown[] {
		return tools.map(tool => ({
			name: tool.name,
			description: tool.description,
			input_schema: tool.parameters
		}));
	}

	private parseResponse(json: Record<string, unknown>): LLMResponse {
		const content = json.content as unknown[];
		let textContent = '';
		const toolCalls: ToolCall[] = [];

		for (const block of content) {
			const b = block as Record<string, unknown>;
			if (b.type === 'text') {
				textContent += b.text as string;
			} else if (b.type === 'tool_use') {
				toolCalls.push({
					id: b.id as string,
					name: b.name as string,
					arguments: b.input as Record<string, unknown>
				});
			}
		}

		const stopReason = json.stop_reason as string;
		const usage = json.usage as Record<string, number> | undefined;

		return {
			content: textContent,
			toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
			finishReason: stopReason === 'tool_use' ? 'tool_calls' : 
				stopReason === 'max_tokens' ? 'length' : 'stop',
			usage: usage ? {
				promptTokens: usage.input_tokens,
				completionTokens: usage.output_tokens,
				totalTokens: usage.input_tokens + usage.output_tokens
			} : undefined
		};
	}
}

/**
 * Ollamaプロバイダー（ローカルLLM）
 */
export class OllamaProvider implements LLMProviderInterface {
	private baseUrl: string;
	private model: string;
	private maxTokens: number;
	private temperature: number;

	constructor(settings: AIAgentSettings) {
		this.baseUrl = settings.ollamaBaseUrl || 'http://localhost:11434';
		this.model = settings.ollamaModel || 'llama3.2';
		this.maxTokens = settings.maxTokens || 4096;
		this.temperature = settings.temperature || 0.7;
	}

	async isAvailable(): Promise<boolean> {
		try {
			const response = await requestUrl({
				url: `${this.baseUrl}/api/tags`,
				method: 'GET'
			});
			return response.status === 200;
		} catch {
			return false;
		}
	}

	async chat(
		messages: ChatMessage[],
		tools?: ToolDefinition[],
		systemPrompt?: string
	): Promise<LLMResponse> {
		const ollamaMessages = this.convertMessages(messages, systemPrompt);
		const ollamaTools = tools ? this.convertTools(tools) : undefined;

		const body: Record<string, unknown> = {
			model: this.model,
			messages: ollamaMessages,
			stream: false,
			options: {
				num_predict: this.maxTokens,
				temperature: this.temperature
			}
		};

		if (ollamaTools && ollamaTools.length > 0) {
			body.tools = ollamaTools;
		}

		const response = await requestUrl({
			url: `${this.baseUrl}/api/chat`,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(body)
		});

		return this.parseResponse(response.json);
	}

	async chatStream(
		messages: ChatMessage[],
		tools?: ToolDefinition[],
		systemPrompt?: string,
		onChunk?: (chunk: StreamChunk) => void
	): Promise<LLMResponse> {
		// 通常のリクエストを使用
		const response = await this.chat(messages, tools, systemPrompt);
		
		if (onChunk) {
			onChunk({ content: response.content, done: true });
		}
		
		return response;
	}

	private convertMessages(messages: ChatMessage[], systemPrompt?: string): unknown[] {
		const result: unknown[] = [];

		if (systemPrompt) {
			result.push({ role: 'system', content: systemPrompt });
		}

		for (const msg of messages) {
			if (msg.role === 'system') continue;

			result.push({
				role: msg.role,
				content: msg.content
			});

			// Ollamaのツール結果処理
			if (msg.toolResults) {
				for (const tr of msg.toolResults) {
					result.push({
						role: 'tool',
						content: tr.error || tr.result
					});
				}
			}
		}

		return result;
	}

	private convertTools(tools: ToolDefinition[]): unknown[] {
		return tools.map(tool => ({
			type: 'function',
			function: {
				name: tool.name,
				description: tool.description,
				parameters: tool.parameters
			}
		}));
	}

	private parseResponse(json: Record<string, unknown>): LLMResponse {
		const message = json.message as Record<string, unknown> | undefined;
		const content = (message?.content as string) || '';
		
		let toolCalls: ToolCall[] | undefined;
		const rawToolCalls = message?.tool_calls as unknown[] | undefined;
		
		if (rawToolCalls && rawToolCalls.length > 0) {
			toolCalls = rawToolCalls.map((tc: unknown, index: number) => {
				const toolCall = tc as Record<string, unknown>;
				const fn = toolCall.function as Record<string, unknown>;
				return {
					id: `ollama_${Date.now()}_${index}`,
					name: fn.name as string,
					arguments: fn.arguments as Record<string, unknown>
				};
			});
		}

		const doneReason = json.done_reason as string | undefined;

		return {
			content,
			toolCalls,
			finishReason: toolCalls ? 'tool_calls' : 
				doneReason === 'length' ? 'length' : 'stop'
		};
	}
}

/**
 * プロバイダーファクトリー
 */
export function createLLMProvider(settings: AIAgentSettings): LLMProviderInterface {
	switch (settings.provider) {
		case 'openai':
			return new OpenAIProvider(settings);
		case 'anthropic':
			return new AnthropicProvider(settings);
		case 'ollama':
			return new OllamaProvider(settings);
		default:
			throw new Error(`Unknown LLM provider: ${settings.provider}`);
	}
}
