import { z } from "zod"

/** 화면·API에서 허용하는 허점 태그(한글 고정) */
export const issueTagSchema = z.enum(["논리적 취약점", "반론"])

export type IssueTag = z.infer<typeof issueTagSchema>

export const evidenceStanceSchema = z.enum([
  "supports",
  "contradicts",
  "insufficient",
])

export type EvidenceStance = z.infer<typeof evidenceStanceSchema>

export const evidenceItemSchema = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
  stance: evidenceStanceSchema,
})

export type EvidenceItem = z.infer<typeof evidenceItemSchema>

export const verificationIssueSchema = z.object({
  id: z.string(),
  tag: issueTagSchema,
  originalText: z.string(),
  reason: z.string(),
  improvementQuestion: z.string(),
  startIndex: z.number().int().min(0),
  endIndex: z.number().int().min(0),
  /** 반드시 1개 이상. 출처를 찾지 못한 경우 stance는 insufficient. */
  evidence: z.array(evidenceItemSchema).min(1),
})

export type VerificationIssue = z.infer<typeof verificationIssueSchema>

export const verificationAnalysisSchema = z.object({
  summary: z.string(),
  issues: z.array(verificationIssueSchema),
})

export type VerificationAnalysis = z.infer<typeof verificationAnalysisSchema>
