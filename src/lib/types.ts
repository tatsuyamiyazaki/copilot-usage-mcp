// GitHub Copilot Usage Metrics API レスポンス型 (apiVersion: 2026-03-10)

// 1日分レポートの API レスポンス
export interface UsageReport1DayResponse {
  download_links: string[];
  report_day: string;
}

// 28日間レポートの API レスポンス
export interface UsageReport28DayResponse {
  download_links: string[];
  report_start_day: string;
  report_end_day: string;
}

// ダウンロード済みコンテンツを含む最終的なレポート結果
export interface UsageReportResult {
  download_links: string[];
  report_day?: string;
  report_start_day?: string;
  report_end_day?: string;
  content: unknown[];
}

// Seats API
export interface CopilotSeatsResponse {
  total_seats: number;
  seats: CopilotSeat[];
}

export interface CopilotSeat {
  assignee: {
    login: string;
    id: number;
    avatar_url: string;
    type: string;
  };
  organization?: {
    login: string;
    id: number;
  };
  assigning_team?: {
    name: string;
    slug: string;
  } | null;
  pending_cancellation_date: string | null;
  last_activity_at: string | null;
  last_activity_editor: string | null;
  created_at: string;
  plan_type: string;
}

// 日付範囲レポートの1日分エントリ
export type DayResult = UsageReportResult | { report_day: string; error: string };

// 日付範囲レポート全体
export interface UsageReportRangeResult {
  since: string;
  until: string;
  results: DayResult[];
}

// Cache
export interface CacheEntry<T> {
  data: T;
  cached_at: string;
}

// Summary
export interface UsageSummary {
  enterprise_metrics: UsageReportResult | { error: string };
  enterprise_user_metrics: UsageReportResult | { error: string };
  org_metrics: UsageReportResult | { error: string };
  org_user_metrics: UsageReportResult | { error: string };
  seats: CopilotSeatsResponse | { error: string };
}
