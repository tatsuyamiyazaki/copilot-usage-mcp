# copilot-usage-mcp

GitHub Copilot の利用状況メトリクスを取得する MCP (Model Context Protocol) サーバーです。

Enterprise、Organization、Team レベルでの Copilot 使用状況データを MCP ツールとして提供します。

## 提供ツール

| ツール名 | 説明 |
|---------|------|
| `get_copilot_metrics_for_enterprise` | Enterprise 全体の日次 Copilot 利用メトリクス |
| `get_copilot_metrics_for_org` | Organization の日次 Copilot 利用メトリクス |
| `get_copilot_metrics_for_team` | Team の日次 Copilot 利用メトリクス |
| `get_copilot_seat_assignments` | Organization の Copilot シート割り当て情報 |
| `get_copilot_usage_summary` | Enterprise / Org / Seats の統合サマリー |

各ツールは、コード補完数・Chat 利用状況・アクティブユーザー数・言語 / エディタ別の内訳などを取得できます。

## セットアップ

### 前提条件

- Node.js 18+
- GitHub Personal Access Token（Copilot メトリクス API へのアクセス権限が必要）

### インストール

```bash
npm install
npm run build
```

### 環境変数

`.env` ファイルまたは環境変数で以下を設定してください。

| 変数名 | 必須 | 説明 |
|--------|------|------|
| `GITHUB_TOKEN` | Yes | GitHub Personal Access Token |
| `GITHUB_ENTERPRISE` | No | Enterprise slug |
| `GITHUB_ORG` | No | Organization 名 |
| `CACHE_DIR` | No | キャッシュディレクトリ（デフォルト: `./cache`） |

### MCP クライアントへの設定

Claude Desktop の場合、`claude_desktop_config.json` に以下を追加します。

```json
{
  "mcpServers": {
    "copilot-usage": {
      "command": "node",
      "args": ["path/to/copilot-usage-mcp/dist/index.js"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxxxxxxxxxxx",
        "GITHUB_ENTERPRISE": "your-enterprise",
        "GITHUB_ORG": "your-org"
      }
    }
  }
}
```

## 開発

```bash
# TypeScript のウォッチモードで開発
npm run dev

# テスト実行
npm test

# テストのウォッチモード
npm run test:watch
```

## ライセンス

[MIT](LICENSE)
