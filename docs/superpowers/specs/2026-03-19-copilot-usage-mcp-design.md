# GitHub Copilot Usage MCP Server — Design Spec

## Overview

GitHub Enterprise 環境における Copilot の利用状況を取得する MCP サーバー。
Node.js + TypeScript で実装し、stdio トランスポートで個人利用する。
目的は導入効果の可視化。

## Tools

| MCP Tool | GitHub API Endpoint | Description |
|---|---|---|
| `get_copilot_metrics_for_enterprise` | `GET /enterprises/{enterprise}/copilot/metrics` | Enterprise 全体の日別メトリクス |
| `get_copilot_metrics_for_org` | `GET /orgs/{org}/copilot/metrics` | Organization 単位の日別メトリクス |
| `get_copilot_metrics_for_team` | `GET /orgs/{org}/team/{team}/copilot/metrics` | Team 単位の日別メトリクス |
| `get_copilot_seat_assignments` | `GET /orgs/{org}/copilot/billing/seats` | Copilot シート割当一覧 |
| `get_copilot_usage_summary` | 複数 API を組合せ | 全レベルの概要を一括取得 |

## Tool Parameters

### Common Parameters (all metrics tools)

- `since?: string` — 開始日 (ISO 8601, e.g. "2026-01-01"). デフォルト: 28 日前
- `until?: string` — 終了日 (ISO 8601). デフォルト: 今日
- `force_refresh?: boolean` — true でキャッシュ無視. デフォルト: false

### Tool-specific Parameters

- `get_copilot_metrics_for_org`: `org?: string` (省略時は環境変数 `GITHUB_ORG`)
- `get_copilot_metrics_for_team`: `org?: string`, `team_slug: string` (必須)
- `get_copilot_seat_assignments`: `org?: string`, `force_refresh?: boolean`
- `get_copilot_usage_summary`: `since?`, `until?`, `team_slug?`, `force_refresh?`

## Output

AIが解釈する前提で、MCP ツールの戻り値としてそのまま返す。

### Metrics 出力内容

- 日別の補完承認数・却下数
- Chat 利用数
- アクティブユーザー数
- 言語別・エディタ別の内訳

### Seats 出力内容

- ユーザー名
- 最終利用日
- 割当日
- エディタ情報

## Architecture

### Tech Stack

- Node.js + TypeScript
- `@modelcontextprotocol/sdk` — MCP 公式 SDK
- `octokit/rest` — GitHub API クライアント
- stdio トランスポート

### Directory Structure

```
copilot-usage/
  src/
    index.ts              # エントリポイント、MCP サーバー起動
    tools/
      enterprise.ts       # get_copilot_metrics_for_enterprise
      org.ts              # get_copilot_metrics_for_org
      team.ts             # get_copilot_metrics_for_team
      seats.ts            # get_copilot_seat_assignments
      summary.ts          # get_copilot_usage_summary
    lib/
      github-client.ts    # Octokit ラッパー、API 分割ロジック
      cache.ts            # キャッシュ読み書き
      types.ts            # 型定義
  cache/                  # キャッシュデータ (.gitignore 対象)
  package.json
  tsconfig.json
  .env.example
  .gitignore
```

### Environment Variables

```
GITHUB_TOKEN=ghp_xxxx           # Personal Access Token (必須)
GITHUB_ENTERPRISE=my-enterprise # Enterprise スラッグ (必須)
GITHUB_ORG=my-org               # Organization 名 (必須)
CACHE_DIR=./cache               # キャッシュ保存先 (オプション)
```

## Cache Design

### Storage

プロジェクト内 `cache/` フォルダに JSON ファイルとして保存。

```
cache/
  enterprise/{enterprise_slug}/metrics/{date}.json
  org/{org_name}/metrics/{date}.json
  org/{org_name}/seats/{timestamp}.json
  team/{org_name}/{team_slug}/metrics/{date}.json
```

### Cache Strategy

- **Metrics (日別)**: 過去日のデータは不変 → 無期限キャッシュ。当日分のみ毎回再取得
- **Seats**: TTL 1 時間

### Cache Control

- 各ツールに `force_refresh` パラメータで強制再取得可能
- `CACHE_DIR` 環境変数でキャッシュ保存先をオーバーライド可能

## 28-Day Chunking Logic

GitHub API は 1 リクエストあたり最大 28 日分のデータを返す。
長期間の取得は自動分割で対応:

```
fetchMetrics(endpoint, since, until):
  1. 期間を 28 日ごとのチャンクに分割
  2. 各チャンクについて:
     - キャッシュに存在 → キャッシュから読込
     - キャッシュにない → API リクエスト → キャッシュに保存
  3. 全チャンクの結果を結合して返却
```

## Error Handling

- **401/403** — トークン不正・権限不足を明示的にメッセージ返却
- **404** — Enterprise/Org/Team が見つからない旨を返却
- **429 (Rate Limit)** — リトライヘッダを尊重して待機・再試行
- **ネットワークエラー** — キャッシュにデータがあればフォールバック返却
