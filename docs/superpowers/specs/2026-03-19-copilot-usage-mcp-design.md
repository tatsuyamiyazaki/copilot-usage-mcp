# GitHub Copilot Usage MCP Server — Design Spec

## Overview

GitHub Enterprise Cloud (GHEC) 環境における Copilot の利用状況を取得する MCP サーバー。
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

### Input Validation

- `since` が `until` より後の場合はエラーを返す
- 日付は ISO 8601 形式 (YYYY-MM-DD) のみ受け付ける。不正な形式はエラー
- `team_slug` は空文字・null の場合エラー

### Tool-specific Parameters

- `get_copilot_metrics_for_enterprise`: `enterprise?: string` (省略時は環境変数 `GITHUB_ENTERPRISE`)
- `get_copilot_metrics_for_org`: `org?: string` (省略時は環境変数 `GITHUB_ORG`)
- `get_copilot_metrics_for_team`: `org?: string`, `team_slug: string` (必須)
- `get_copilot_seat_assignments`: `org?: string`, `force_refresh?: boolean`. ページネーション自動処理（全ページ取得）
- `get_copilot_usage_summary`: `since?`, `until?`, `team_slug?`, `force_refresh?`

### `get_copilot_usage_summary` 詳細

Enterprise + Org + Seats の3つを常に取得する。`team_slug` が指定された場合は Team メトリクスも追加取得する。
部分的に失敗した場合は、成功したデータのみ返却し、失敗した部分はエラーメッセージを含める。

出力構造:
```json
{
  "enterprise": { ... },  // or { "error": "..." }
  "org": { ... },         // or { "error": "..." }
  "seats": { ... },       // or { "error": "..." }
  "team": { ... }         // team_slug 指定時のみ
}
```

## Output

AI が解釈する前提で、MCP ツールの戻り値としてそのまま返す。
エラー時は MCP の `isError: true` フラグ付きで、エラーメッセージを text content として返す。

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

### Required PAT Scopes

- `manage_billing:copilot` — Copilot シート情報の読取り
- `read:enterprise` — Enterprise レベルのメトリクス取得
- `read:org` — Organization レベルのメトリクス取得

## Cache Design

### Storage

プロジェクトルートからの相対パス `cache/` に JSON ファイルとして保存。
パスはプロジェクトルート基準で解決する（`process.cwd()` ではなく `__dirname` 基準）。

```
cache/
  enterprise/{enterprise_slug}/metrics/{date}.json
  org/{org_name}/metrics/{date}.json
  org/{org_name}/seats/{timestamp}.json
  team/{org_name}/{team_slug}/metrics/{date}.json
```

### Cache Granularity

API レスポンス（最大 28 日分）を日別に分割し、1 日 1 ファイルとして保存する。
これによりキャッシュヒットを日単位で判定でき、部分的なキャッシュ活用が可能。

### Cache Strategy

- **Metrics (日別)**: 2 日前以前のデータは無期限キャッシュ。直近 1 日分は TTL 24 時間（バックフィル対応）。当日分は毎回再取得
- **Seats**: TTL 1 時間
- 日付判定は UTC 基準

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
     - 全日分がキャッシュに存在 → キャッシュから読込
     - キャッシュにない日がある → API リクエスト → 日別に分割してキャッシュに保存
  3. 全チャンクの結果を日付順に結合して返却
```

API リクエストは逐次実行する（Rate Limit 負荷を抑えるため）。

## Error Handling

- **401/403** — トークン不正・権限不足を明示的にメッセージ返却。必要な PAT スコープを案内
- **404** — Enterprise/Org/Team が見つからない旨を返却
- **429 (Rate Limit)** — リトライヘッダ (`retry-after`) を尊重して待機・再試行（最大 3 回）
- **5xx (Server Error)** — 最大 3 回リトライ（exponential backoff）
- **ネットワークエラー** — キャッシュにデータがあればフォールバック返却（Seats は TTL 超過でもフォールバック可）
- **入力バリデーションエラー** — `isError: true` でエラーメッセージを返却
