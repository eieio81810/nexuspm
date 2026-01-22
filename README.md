# NexusPM

Obsidian用のハドこみゅプラグインです。
数あるプロジェクトを一元管理し、WBSビューやグラフビューの強化など、プロジェクト管理だけでなくナレッジ管理もサポートします。

## 開発のセットアップ

### 0. エンコーディング設定（重要！）

日本語を含むファイルを正しく扱うために、Visual Studio Codeで以下を確認してください：

1. ファイルを開いた状態で、右下のエンコーディング表示を確認
2. 「UTF-8」と表示されていない場合は、クリックして「UTF-8で保存」を選択
3. `main.ts` など日本語を含むファイルは必ずUTF-8（BOMなし）で保存

### 1. 依存関係のインストール

```bash
cd plugin
npm install
```

### 2. 開発モードで実行

```bash
npm run dev
```

これでファイルの変更を検知し、自動でビルドします。

### 3. テストの実行

```bash
# すべてのテストを実行
npm test

# ウォッチモード（ファイル変更時に自動実行）
npm run test:watch

# カバレッジレポート付き
npm run test:coverage
```

### 4. ビルド（本番用）

```bash
npm run build
```

### 5. Obsidianでの使用

ビルド後、プラグインファイルをObsidianのプラグインディレクトリにコピー：

```powershell
# PowerShell（Windows）
Copy-Item -Path plugin/main.js,plugin/manifest.json -Destination docs/.obsidian/plugins/nexuspm/ -Force
```

```bash
# Bash（Mac/Linux）
cp plugin/main.js plugin/manifest.json docs/.obsidian/plugins/nexuspm/
```

その後、Obsidianでプラグインをリロード：
- Obsidianを再起動、または
- 設定 → コミュニティプラグイン → 「NexusPM」を無効化 → 有効化

## 機能

### WBS（Work Breakdown Structure）ビュー 📋

プロジェクトフォルダ内のタスクを階層的なWBS形式で表示・管理します。

**使い方:**
1. ファイルエクスプローラーでフォルダを右クリック → 「WBSとして開く」
2. または、コマンドパレットから「Open WBS View」を実行

**タスクファイルの設定例:**
```yaml
---
parent: "[[親タスク]]"
status: in-progress
assignee: 田中
due-date: 2024-12-31
progress: 50
priority: 2
estimated-hours: 8
---
# タスクのタイトル

タスクの詳細説明...
```

**対応プロパティ:**
| プロパティ | 説明 | 値の例 |
|-----------|------|--------|
| `parent` | 親タスクへのリンク | `[[親タスク]]` |
| `status` | ステータス | `not-started`, `in-progress`, `completed`, `blocked`, `cancelled` |
| `assignee` | 担当者 | `田中` |
| `start-date` | 開始日 | `2024-01-01` |
| `due-date` | 期限 | `2024-12-31` |
| `progress` | 進捗率（0-100） | `50` |
| `priority` | 優先度（1-5、1が最高） | `1` |
| `estimated-hours` | 見積もり時間 | `8` |
| `actual-hours` | 実績時間 | `4` |

**日本語ステータスにも対応:**
- `完了`, `済み` → completed
- `進行中`, `作業中` → in-progress
- `未着手`, `予定` → not-started
- `ブロック中`, `保留` → blocked
- `キャンセル`, `中止` → cancelled

### グラフビューH1見出し表示

グラフビューのノードラベルを、ファイル名ではなく**ファイル内の最初のH1見出し**で表示します。

**使い方:**
1. Obsidian の設定を開く
2. 「NexusPM」セクション → 「グラフビューでH1見出しを使用」をON
3. グラフビューを開くと、ノード名がH1見出しに置き換わります

**仕組み:**
- メタデータキャッシュ優先でH1見出しを取得
- ファイル名ラベルを直接H1に書き換え
- 設定OFF時に元のファイル名に復元

### その他の機能

- **挨拶メッセージ表示**: リボンアイコンまたはコマンドパレットから挨拶メッセージを表示
- **設定画面**: 挨拶メッセージをカスタマイズ可能

## テスト駆動開発（TDD）

このプラグインはテスト駆動開発を採用しています。

### Red → Green → Refactor サイクル

1. **Red**: 失敗するテストを `tests/` に書く
2. **Green**: 最小限のコードで `src/` に実装してテストを通す
3. **Refactor**: テストが通った状態を保ちながらコードを改善
4. **Integrate**: `main.ts` から新機能を呼び出す

### テストの書き方

`plugin/tests/` に新しいテストファイルを作成：

```typescript
import { MyFeature } from '../src/myFeature';

describe('MyFeature', () => {
  it('should do something', () => {
    const feature = new MyFeature();
    expect(feature.doSomething()).toBe('expected result');
  });
});
```

詳細は `docs/Plugin_Development_Guide.md` を参照してください。

## 開発のヒント

### プロジェクト構造

```
plugin/
├── src/                    # ビジネスロジック（テスト可能）
│   └── graphLabelManager.ts
├── tests/                  # Jestテスト
│   └── graphLabelManager.test.ts
├── main.ts                 # プラグインエントリーポイント
├── manifest.json           # プラグインメタデータ
└── jest.config.js          # Jestテスト設定
```

### ベストプラクティス

- **ロジックの分離**: Obsidian API依存を最小化し、`src/` にビジネスロジックを分離
- **テストファースト**: 新機能はテストを先に書く
- **UTF-8エンコーディング**: すべてのファイルをUTF-8（BOMなし）で保存
- **型安全**: TypeScript の型チェックを活用（`npm run typecheck`）

### 参考リンク

- Obsidian APIドキュメント: https://github.com/obsidianmd/obsidian-api
- 開発ガイド: `docs/Plugin_Development_Guide.md`

## プラグインの有効化

1. Obsidianの設定を開く
2. 「コミュニティプラグイン」に移動
3. 「制限モードをオフ」にする（初回のみ）
4. 「NexusPM」を有効化

## コントリビューション

プラグインへの貢献を歓迎します！

1. このリポジトリをフォーク
2. 新機能ブランチを作成（`git checkout -b feature/amazing-feature`）
3. テストを書いてから実装（TDD）
4. コミット（`git commit -m 'Add amazing feature'`）
5. ブランチにプッシュ（`git push origin feature/amazing-feature`）
6. Pull Requestを作成

## ライセンス

MIT
