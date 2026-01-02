import { TFile, MetadataCache, Vault } from 'obsidian';

interface CanvasNode {
	id?: string;
	type?: string;
	text?: string;
	file?: string;
}

interface CanvasData {
	nodes?: CanvasNode[];
}

export class GraphLabelManager {
	private h1Cache = new Map<string, string | null>();

	constructor(
		private metadataCache: MetadataCache,
		private vault: Vault
	) {}

	async getFirstH1(file: TFile): Promise<string | null> {
		// Canvas ファイルの処理
		if (file.extension === 'canvas') {
			return await this.getFirstH1FromCanvas(file);
		}

		// Markdown ファイルの処理（既存ロジック）
		const cache = this.metadataCache.getFileCache(file);
		const cachedHeading = cache?.headings?.find(h => h.level === 1)?.heading;
		if (cachedHeading) return cachedHeading.trim();

		try {
			const content = await this.vault.read(file);
			const lines = content.split('\n');
			for (const line of lines) {
				const trimmed = line.trim();
				if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) {
					return trimmed.substring(2).trim();
				}
			}
		} catch {
			// File read errors are expected for some scenarios, silently continue
		}
		return null;
	}

	private async getFirstH1FromCanvas(canvasFile: TFile): Promise<string | null> {
		try {
			const content = await this.vault.read(canvasFile);
			const canvasData: CanvasData = JSON.parse(content);
			
			if (!canvasData.nodes || !Array.isArray(canvasData.nodes)) {
				return null;
			}

			// テキストノードから最初のH1を探す
			for (const node of canvasData.nodes) {
				if (node.type === 'text' && node.text) {
					const h1 = this.extractH1FromText(node.text);
					if (h1) return h1;
				}
			}

			// ファイル参照ノードから最初のH1を探す
			for (const node of canvasData.nodes) {
				if (node.type === 'file' && node.file) {
					const referencedFile = this.vault.getAbstractFileByPath(node.file);
					if (referencedFile && 'path' in referencedFile) {
						const h1 = await this.getFirstH1(referencedFile as TFile);
						if (h1) return h1;
					}
				}
			}

			return null;
		} catch {
			// JSON parse errors or file read errors
			return null;
		}
	}

	private extractH1FromText(text: string): string | null {
		const lines = text.split('\n');
		for (const line of lines) {
			const trimmed = line.trim();
			if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) {
				return trimmed.substring(2).trim();
			}
		}
		return null;
	}

	async getH1ForNode(nodeId: string, resolveFile: (id: string) => TFile | null): Promise<string | null> {
		if (this.h1Cache.has(nodeId)) {
			return this.h1Cache.get(nodeId) ?? null;
		}
		const file = resolveFile(nodeId);
		if (!file) return null;
		const h1 = await this.getFirstH1(file);
		if (h1) this.h1Cache.set(nodeId, h1);
		return h1;
	}

	clearCache() {
		this.h1Cache.clear();
	}

	invalidateFileCache(nodeId: string) {
		this.h1Cache.delete(nodeId);
	}
}
