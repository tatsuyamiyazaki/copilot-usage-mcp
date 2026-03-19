// GitHub Copilot Metrics API のレスポンス型

export interface CopilotMetricsDay {
  date: string;
  total_active_users: number;
  total_engaged_users: number;
  copilot_ide_code_completions: CopilotIdeCodeCompletions | null;
  copilot_ide_chat: CopilotIdeChat | null;
  copilot_dotcom_chat: CopilotDotcomChat | null;
  copilot_dotcom_pull_requests: CopilotDotcomPullRequests | null;
}

export interface CopilotIdeCodeCompletions {
  active_users: number;
  engaged_users: number;
  languages: CopilotLanguageMetric[];
  editors: CopilotEditorMetric[];
  models: CopilotModelMetric[];
}

export interface CopilotIdeChat {
  active_users: number;
  engaged_users: number;
  editors: CopilotEditorMetric[];
  models: CopilotModelMetric[];
}

export interface CopilotDotcomChat {
  active_users: number;
  engaged_users: number;
  models: CopilotModelMetric[];
}

export interface CopilotDotcomPullRequests {
  active_users: number;
  engaged_users: number;
  repositories: CopilotRepositoryMetric[];
}

export interface CopilotLanguageMetric {
  name: string;
  total_engaged_users: number;
  total_code_suggestions?: number;
  total_code_acceptances?: number;
  total_code_lines_suggested?: number;
  total_code_lines_accepted?: number;
}

export interface CopilotEditorMetric {
  name: string;
  total_engaged_users: number;
  total_code_suggestions?: number;
  total_code_acceptances?: number;
}

export interface CopilotModelMetric {
  name: string;
  total_engaged_users: number;
  total_code_suggestions?: number;
  total_code_acceptances?: number;
}

export interface CopilotRepositoryMetric {
  name: string;
  total_engaged_users: number;
  total_pr_descriptions_generated?: number;
  total_pr_summaries_generated?: number;
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

// Cache
export interface CacheEntry<T> {
  data: T;
  cached_at: string; // ISO 8601
}

// Summary
export interface UsageSummary {
  enterprise: CopilotMetricsDay[] | { error: string };
  org: CopilotMetricsDay[] | { error: string };
  seats: CopilotSeatsResponse | { error: string };
  team?: CopilotMetricsDay[] | { error: string };
}
