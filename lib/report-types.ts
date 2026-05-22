export type Report = {
  source_key: string;
  report_date: string;
  gicode: string | null;
  stock_name: string;
  title: string;
  summary: string[];
  opinion: string | null;
  opinion_change: string | null;
  target_price: number | null;
  target_price_change: string | null;
  prev_close: number | null;
  provider: string | null;
  author: string | null;
  is_best: boolean;
  actual_6m: number | null;
  actual_1y: number | null;
  previous_6m?: number | null;
  previous_1y?: number | null;
  actual_6m_after?: number | null;
  actual_1y_after?: number | null;
  price_basis?: 'after' | 'before';
  naver_url: string | null;
  hankyung_url: string | null;
  newspim_url: string | null;
};

export type ReportStats = {
  count: number;
  stocks: number;
  providers: number;
  authors: number;
  targetHitRate: {
    hit: number;
    total: number;
    pct: number | null;
  };
  avgReturn6m: number | null;
};

export type ReportOptions = {
  providers: string[];
  opinions: Array<{ value: string; count: number }>;
  tpChanges: string[];
  minDate: string | null;
  maxDate: string | null;
};

export type ReportListResponse = {
  rows: Report[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  stats: ReportStats;
  options: ReportOptions;
  source?: 'local' | 'supabase';
  warning?: string;
};

export type CountRankRow = {
  name: string;
  count: number;
  gicode?: string | null;
};

export type DistributionRow = {
  name: string;
  count: number;
};

export type ChangeRankRow = {
  name: string;
  gicode: string | null;
  up: number;
  hold: number;
  down: number;
  neu: number;
  total: number;
  upPct: number;
  downPct: number;
};

export type ReportAnalyticsResponse = {
  source?: 'local' | 'supabase';
  warning?: string;
  total: number;
  stocks: CountRankRow[];
  providers: CountRankRow[];
  authors: CountRankRow[];
  months: DistributionRow[];
  targetPriceChanges: DistributionRow[];
  opinions: DistributionRow[];
  rank: {
    targetUp: ChangeRankRow[];
    targetDown: ChangeRankRow[];
    opinionUp: ChangeRankRow[];
    opinionDown: ChangeRankRow[];
  };
};

export type TargetPoint = {
  report_date: string;
  target_price: number;
  author: string | null;
  provider: string | null;
  opinion: string | null;
};

export type StockAuthorSummary = {
  author: string;
  provider: string | null;
  count: number;
  latestDate: string;
  latestOpinion: string | null;
  latestTargetPrice: number | null;
  avgTargetPrice: number | null;
  minTargetPrice: number | null;
  maxTargetPrice: number | null;
};

export type StockDetailResponse = {
  source?: 'local' | 'supabase';
  warning?: string;
  gicode: string | null;
  stockName: string;
  totalReports: number;
  firstDate: string | null;
  latestDate: string | null;
  latestClose: number | null;
  targetPriceMin: number | null;
  targetPriceMax: number | null;
  authors: StockAuthorSummary[];
  targetPoints: TargetPoint[];
  reports: Report[];
};
