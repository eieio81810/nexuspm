import { GraphLabelManager } from '../src/graphLabelManager';
import { TFile, MetadataCache, Vault } from 'obsidian';

// Obsidian API のモック
const mockMetadataCache = {
	getFileCache: jest.fn(),
} as unknown as MetadataCache;

const mockVault = {
	read: jest.fn(),
	getAbstractFileByPath: jest.fn(),
} as unknown as Vault;

describe('GraphLabelManager', () => {
	let manager: GraphLabelManager;

	beforeEach(() => {
		manager = new GraphLabelManager(mockMetadataCache, mockVault);
		jest.clearAllMocks();
	});

	describe('getFirstH1', () => {
		it('should return H1 from metadata cache', async () => {
			const mockFile = { path: 'test.md' } as TFile;
			(mockMetadataCache.getFileCache as jest.Mock).mockReturnValue({
				headings: [{ level: 1, heading: 'Test Title' }],
			});

			const result = await manager.getFirstH1(mockFile);
			expect(result).toBe('Test Title');
			expect(mockVault.read).not.toHaveBeenCalled();
		});

		it('should parse H1 from file content when not in cache', async () => {
			const mockFile = { path: 'test.md' } as TFile;
			(mockMetadataCache.getFileCache as jest.Mock).mockReturnValue(null);
			(mockVault.read as jest.Mock).mockResolvedValue('# File Title\n\nContent here');

			const result = await manager.getFirstH1(mockFile);
			expect(result).toBe('File Title');
		});

		it('should return null when no H1 exists', async () => {
			const mockFile = { path: 'test.md' } as TFile;
			(mockMetadataCache.getFileCache as jest.Mock).mockReturnValue(null);
			(mockVault.read as jest.Mock).mockResolvedValue('## H2 Only\n\nContent');

			const result = await manager.getFirstH1(mockFile);
			expect(result).toBeNull();
		});

		it('should handle file read errors gracefully', async () => {
			const mockFile = { path: 'test.md' } as TFile;
			(mockMetadataCache.getFileCache as jest.Mock).mockReturnValue(null);
			(mockVault.read as jest.Mock).mockRejectedValue(new Error('File not found'));

			const result = await manager.getFirstH1(mockFile);
			expect(result).toBeNull();
		});
	});

	describe('getH1ForNode', () => {
		it('should return cached H1 if available', async () => {
			const mockResolveFile = jest.fn();
			const nodeId = 'test.md';

			// 初回呼び出しでキャッシュに保存
			const mockFile = { path: 'test.md' } as TFile;
			mockResolveFile.mockReturnValue(mockFile);
			(mockMetadataCache.getFileCache as jest.Mock).mockReturnValue({
				headings: [{ level: 1, heading: 'Cached Title' }],
			});

			const firstResult = await manager.getH1ForNode(nodeId, mockResolveFile);
			expect(firstResult).toBe('Cached Title');

			// 2回目はキャッシュから取得
			const secondResult = await manager.getH1ForNode(nodeId, mockResolveFile);
			expect(secondResult).toBe('Cached Title');
			expect(mockResolveFile).toHaveBeenCalledTimes(1); // 1回しか呼ばれない
		});

		it('should return null when file cannot be resolved', async () => {
			const mockResolveFile = jest.fn().mockReturnValue(null);
			const nodeId = 'nonexistent.md';

			const result = await manager.getH1ForNode(nodeId, mockResolveFile);
			expect(result).toBeNull();
		});
	});

	describe('clearCache', () => {
		it('should clear all cached H1 values', async () => {
			const mockFile = { path: 'test.md' } as TFile;
			const mockResolveFile = jest.fn().mockReturnValue(mockFile);
			(mockMetadataCache.getFileCache as jest.Mock).mockReturnValue({
				headings: [{ level: 1, heading: 'Title' }],
			});

			await manager.getH1ForNode('test.md', mockResolveFile);
			manager.clearCache();

			// キャッシュクリア後、再度ファイル解決が必要
			await manager.getH1ForNode('test.md', mockResolveFile);
			expect(mockResolveFile).toHaveBeenCalledTimes(2);
		});
	});

	describe('invalidateFileCache', () => {
		it('should invalidate cache for a specific file', async () => {
			const mockFile = { path: 'test.md' } as TFile;
			const mockResolveFile = jest.fn().mockReturnValue(mockFile);
			(mockMetadataCache.getFileCache as jest.Mock).mockReturnValue({
				headings: [{ level: 1, heading: 'Old Title' }],
			});

			// 初回キャッシュ
			await manager.getH1ForNode('test.md', mockResolveFile);
			expect(mockResolveFile).toHaveBeenCalledTimes(1);

			// 特定ファイルのキャッシュを無効化
			manager.invalidateFileCache('test.md');

			// 新しいタイトルで再取得
			(mockMetadataCache.getFileCache as jest.Mock).mockReturnValue({
				headings: [{ level: 1, heading: 'New Title' }],
			});

			const result = await manager.getH1ForNode('test.md', mockResolveFile);
			expect(result).toBe('New Title');
			expect(mockResolveFile).toHaveBeenCalledTimes(2);
		});
	});

	describe('Canvas file support', () => {
		it('should extract text from canvas text node', async () => {
			const mockFile = { path: 'test.canvas', extension: 'canvas' } as TFile;
			const canvasContent = JSON.stringify({
				nodes: [
					{ id: 'node1', type: 'text', text: '# Canvas Title' },
				],
			});
			(mockVault.read as jest.Mock).mockResolvedValue(canvasContent);

			const result = await manager.getFirstH1(mockFile);
			expect(result).toBe('Canvas Title');
		});

		it('should return null for canvas with no H1 text node', async () => {
			const mockFile = { path: 'test.canvas', extension: 'canvas' } as TFile;
			const canvasContent = JSON.stringify({
				nodes: [
					{ id: 'node1', type: 'text', text: '## H2 Only' },
				],
			});
			(mockVault.read as jest.Mock).mockResolvedValue(canvasContent);

			const result = await manager.getFirstH1(mockFile);
			expect(result).toBeNull();
		});

		it('should handle canvas file node referencing markdown file', async () => {
			const mockCanvasFile = { path: 'test.canvas', extension: 'canvas' } as TFile;
			const mockMdFile = { path: 'referenced.md', extension: 'md' } as TFile;
			
			const canvasContent = JSON.stringify({
				nodes: [
					{ id: 'fileNode', type: 'file', file: 'referenced.md' },
				],
			});
			
			(mockVault.read as jest.Mock).mockImplementation((file: TFile) => {
				if (file.path === 'test.canvas') {
					return Promise.resolve(canvasContent);
				}
				if (file.path === 'referenced.md') {
					return Promise.resolve('# Referenced Title\n\nContent');
				}
				return Promise.reject(new Error('File not found'));
			});

			(mockVault.getAbstractFileByPath as jest.Mock).mockImplementation((path: string) => {
				if (path === 'referenced.md') return mockMdFile;
				return null;
			});

			(mockMetadataCache.getFileCache as jest.Mock).mockReturnValue(null);

			const mockResolveFile = jest.fn((id: string) => {
				if (id === 'test.canvas') return mockCanvasFile;
				if (id === 'referenced.md') return mockMdFile;
				return null;
			});

			const result = await manager.getH1ForNode('test.canvas', mockResolveFile);
			expect(result).toBe('Referenced Title');
		});

		it('should handle invalid canvas JSON gracefully', async () => {
			const mockFile = { path: 'invalid.canvas', extension: 'canvas' } as TFile;
			(mockVault.read as jest.Mock).mockResolvedValue('invalid json');

			const result = await manager.getFirstH1(mockFile);
			expect(result).toBeNull();
		});

		it('should extract first H1 from multiple text nodes in canvas', async () => {
			const mockFile = { path: 'test.canvas', extension: 'canvas' } as TFile;
			const canvasContent = JSON.stringify({
				nodes: [
					{ id: 'node1', type: 'text', text: 'No heading' },
					{ id: 'node2', type: 'text', text: '# First Title' },
					{ id: 'node3', type: 'text', text: '# Second Title' },
				],
			});
			(mockVault.read as jest.Mock).mockResolvedValue(canvasContent);

			const result = await manager.getFirstH1(mockFile);
			expect(result).toBe('First Title');
		});
	});
});
