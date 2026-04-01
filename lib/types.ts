export type FlawCategory = "weakness" | "counter"

export interface Flaw {
  id: string
  category: FlawCategory
  originalText: string
  reason: string
  improvementQuestion: string
  startIndex: number
  endIndex: number
}

export interface ScanResult {
  originalContent: string
  flaws: Flaw[]
}

export type AppState = "input" | "scanning" | "result"
