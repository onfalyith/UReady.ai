import type { VerificationAnalysis, VerificationIssue } from "@/lib/verification/schema"

export type Flaw = VerificationIssue

export interface ScanResult {
  originalContent: string
  analysis: VerificationAnalysis
  flaws: Flaw[]
}

export type AppState = "input" | "scanning" | "result"

/** @deprecated 레거시 출처 검증 타입 — 새 플로우에서는 analysis.evidence 사용 */
export type CitationType = "url" | "doi" | "unknown"

export type VerificationOverall = "pass" | "warn" | "block"

export type ExistenceStatus = "exists" | "not_found" | "unknown" | "error"

export type CredibilityLabel = "high" | "medium" | "low" | "unknown"

export interface SourceCitation {
  id: string
  type: CitationType
  raw: string
  url?: string
  doi?: string
}

export interface CredibilitySignals {
  label: CredibilityLabel
  score: number
  signals: string[]
  limitations?: string[]
}

export interface SourceVerificationItem {
  citation: SourceCitation
  existence: {
    status: ExistenceStatus
    httpStatus?: number
    note?: string
  }
  credibility: CredibilitySignals
  evidence?: Record<string, unknown>
}

export interface SourceVerificationReport {
  overall: VerificationOverall
  summary: string
  extractedCount: number
  items: SourceVerificationItem[]
  limitations: string[]
}
