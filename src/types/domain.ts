export const WORKSPACE_ROLES = ["owner", "admin", "translator", "reviewer"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const LANGUAGE_DIRECTIONS = ["en-ar", "ar-en"] as const;
export type LanguageDirection = (typeof LANGUAGE_DIRECTIONS)[number];

export const PROJECT_STATES = [
  "draft",
  "estimating",
  "ready",
  "translating",
  "review",
  "approved",
  "failed",
  "cancelled",
] as const;
export type ProjectState = (typeof PROJECT_STATES)[number];

export const JOB_STAGES = [
  "queued",
  "validating",
  "extracting",
  "ocr_review",
  "reserving_credits",
  "retrieving_context",
  "translating",
  "quality_check",
  "reconstructing",
  "completed",
  "failed",
  "cancelled",
] as const;
export type JobStage = (typeof JOB_STAGES)[number];

export type DocumentNodeType =
  | "page"
  | "header"
  | "footer"
  | "heading"
  | "paragraph"
  | "table"
  | "table_cell"
  | "image"
  | "list_item";

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
}

export interface TextStyle {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  italic?: boolean;
  color?: string;
  alignment?: "start" | "center" | "end" | "justify";
  direction?: "ltr" | "rtl";
}

export interface DocumentNode {
  id: string;
  type: DocumentNodeType;
  sourceText: string;
  translatedText?: string;
  page: number;
  order: number;
  confidence?: number;
  bounds?: BoundingBox;
  style?: TextStyle;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface TranslationSegment {
  id: string;
  nodeId: string;
  sourceText: string;
  translatedText: string;
  order: number;
  status: "pending" | "translated" | "edited" | "approved" | "failed";
  qualityFlags: string[];
}

export interface LayoutWarning {
  code: "overflow" | "clipped" | "overlap" | "font_substitution" | "material_reflow" | "ocr_uncertain" | "branding_skipped" | "branding_overlap" | "formatting_approximate";
  message: string;
  page: number;
  nodeId?: string;
  severity: "info" | "warning" | "error";
}

export interface JobProgress {
  jobId: string;
  stage: JobStage;
  percent: number;
  completedSegments: number;
  totalSegments: number;
  warnings: LayoutWarning[];
  message?: string;
}

export interface CreditLedgerEntry {
  id: string;
  workspaceId: string;
  type: "beta_grant" | "admin_grant" | "translation_usage" | "reversal";
  delta: number;
  balanceAfter: number;
  reason: string | null;
  createdAt: string;
}

export interface CanonicalDocument {
  version: 1;
  title: string;
  mimeType: string;
  direction: LanguageDirection;
  pageCount: number;
  sourceWordCount: number;
  nodes: DocumentNode[];
  warnings: LayoutWarning[];
  pages?: Array<{ width: number; height: number; margin?: number }>;
  sourceHasLetterhead?: boolean;
}

export interface BrandingPlacement {
  x: number;
  y: number;
  width: number;
  pages: "first" | "all" | "last";
}

export interface BrandingSelection extends BrandingPlacement {
  assetId: string;
  skipIfPresent: boolean;
  alreadyPresent: boolean;
}

export interface BrandingAsset {
  id: string;
  name: string;
  kind: "letterhead" | "stamp";
  width: number;
  height: number;
  placement: BrandingPlacement;
  previewUrl: string;
}

// --- Commercial layer ---
export interface PlanSummary { code: string; name: string; nameAr?: string | null; tagline?: string | null; taglineAr?: string | null; priceMonthly: number; currency: string; monthlyWordAllowance: number; maxSeats: number; features: string[]; }
export interface SubscriptionSummary { planCode: string; planName: string; status: "trialing" | "active" | "past_due" | "canceled"; currentPeriodStart: string; currentPeriodEnd: string; cancelAtPeriodEnd: boolean; provider: string; }
export interface BillingStatement { id: string; kind: string; amount: number; currency: string; description?: string | null; planCode?: string | null; createdAt: string; }
export interface SalesTotals { recorded: number; received: number; outstanding: number; currency: string; count: number; }
export interface SaleRecord { id: string; customerName: string; description?: string | null; amount: number; currency: string; saleDate: string; status: "recorded" | "partially_paid" | "paid" | "void"; amountPaid: number; outstanding: number; documentProjectId?: string | null; createdAt: string; }
