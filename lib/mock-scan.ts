import { ScanResult, Flaw } from "./types"

/**
 * 데모용 모의 스캔(랜덤 문장 기반). 실제 LLM·Dify 연동 시 시스템 프롬프트는
 * `lib/prompts/flaw-analysis.ts`의 `FLAW_ANALYSIS_SYSTEM_PROMPT`를 사용하세요.
 */
export async function mockScanContent(content: string): Promise<ScanResult> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 3000))

  // Generate mock flaws based on content
  const flaws = generateMockFlaws(content)

  const analysis = {
    summary: "데모용 모의 분석입니다. 실제 서비스는 Gemini 검색 그라운딩 API를 사용합니다.",
    issues: flaws,
  }

  return {
    originalContent: content,
    analysis,
    flaws,
  }
}

function mockEvidence(): Flaw["evidence"] {
  return [
    {
      title: "데모",
      url: "",
      snippet: "모의 데이터이며 실제 웹 검색 근거가 아닙니다.",
      stance: "근거 부족",
    },
  ]
}

function generateMockFlaws(content: string): Flaw[] {
  const sentences = content.split(/[.。!?]/).filter(s => s.trim().length > 10)
  const flaws: Flaw[] = []

  // Generate 2-4 weaknesses and 1-3 counters based on content length
  const numWeaknesses = Math.min(Math.max(2, Math.floor(sentences.length / 3)), 4)
  const numCounters = Math.min(Math.max(1, Math.floor(sentences.length / 4)), 3)

  const usedIndices = new Set<number>()

  // Generate weaknesses
  for (let i = 0; i < numWeaknesses && i < sentences.length; i++) {
    let sentenceIndex: number
    do {
      sentenceIndex = Math.floor(Math.random() * sentences.length)
    } while (usedIndices.has(sentenceIndex) && usedIndices.size < sentences.length)
    
    usedIndices.add(sentenceIndex)
    const sentence = sentences[sentenceIndex].trim()
    
    const startIndex = content.indexOf(sentence)
    if (startIndex === -1) continue

    flaws.push({
      id: `weakness-${i}`,
      tag: "논리적 취약점",
      originalText: sentence.length > 50 ? sentence.slice(0, 50) + "..." : sentence,
      reason: getWeaknessReason(i),
      improvementQuestion: getWeaknessQuestion(i),
      startIndex,
      endIndex: startIndex + sentence.length,
      sourceReliability: "pass",
      evidence: mockEvidence(),
    })
  }

  // Generate counters
  for (let i = 0; i < numCounters && usedIndices.size < sentences.length; i++) {
    let sentenceIndex: number
    do {
      sentenceIndex = Math.floor(Math.random() * sentences.length)
    } while (usedIndices.has(sentenceIndex) && usedIndices.size < sentences.length)
    
    usedIndices.add(sentenceIndex)
    const sentence = sentences[sentenceIndex].trim()
    
    const startIndex = content.indexOf(sentence)
    if (startIndex === -1) continue

    flaws.push({
      id: `counter-${i}`,
      tag: "반론",
      originalText: sentence.length > 50 ? sentence.slice(0, 50) + "..." : sentence,
      reason: getCounterReason(i),
      improvementQuestion: getCounterQuestion(i),
      startIndex,
      endIndex: startIndex + sentence.length,
      sourceReliability: "pass",
      evidence: mockEvidence(),
    })
  }

  // Sort by position in content
  return flaws.sort((a, b) => a.startIndex - b.startIndex)
}

function getWeaknessReason(index: number): string {
  const reasons = [
    "이 주장은 구체적인 데이터나 출처 없이 제시되어 있어, 청중이 신뢰성에 의문을 제기할 수 있습니다. 주장의 근거가 되는 통계나 연구 결과가 명시되지 않았습니다.",
    "인과관계가 명확하게 설명되지 않았습니다. A와 B 사이의 상관관계만 제시되어 있고, 왜 A가 B를 야기하는지에 대한 논리적 연결고리가 부족합니다.",
    "일반화의 오류 가능성이 있습니다. 특정 사례를 전체에 적용하고 있으나, 예외적인 상황이나 다른 조건에서의 결과는 고려되지 않았습니다.",
    "핵심 용어에 대한 정의가 모호합니다. 청중마다 다르게 해석할 수 있어 의도한 메시지가 정확히 전달되지 않을 수 있습니다."
  ]
  return reasons[index % reasons.length]
}

function getWeaknessQuestion(index: number): string {
  const questions = [
    "이 주장을 뒷받침하는 구체적인 데이터나 연구 결과를 추가할 수 있을까요? 출처를 명시하면 청중의 신뢰를 얻는 데 도움이 될 것입니다.",
    "A가 B를 야기한다고 말할 수 있는 근거는 무엇인가요? 다른 요인이 개입했을 가능성은 없나요?",
    "이 결론이 모든 상황에 적용된다고 확신하시나요? 예외가 될 수 있는 경우는 무엇이 있을까요?",
    "여기서 사용된 용어의 정확한 의미는 무엇인가요? 청중이 같은 방식으로 이해할 수 있도록 정의를 추가하면 어떨까요?"
  ]
  return questions[index % questions.length]
}

function getCounterReason(index: number): string {
  const reasons = [
    "이 입장에 반대하는 측에서는 비용 대비 효과에 의문을 제기할 수 있습니다. 투자 대비 실질적인 성과가 검증되지 않았다는 반론이 예상됩니다.",
    "현실적인 실행 가능성에 대한 의문이 제기될 수 있습니다. 이상적인 상황을 전제로 하고 있어, 실제 적용 시 발생할 수 있는 장애물이 고려되지 않았습니다.",
    "기존 시스템이나 방식을 지지하는 측에서는 변화에 따른 리스크를 강조할 수 있습니다. 안정성과 예측 가능성을 중시하는 관점에서 반대 의견이 나올 수 있습니다."
  ]
  return reasons[index % reasons.length]
}

function getCounterQuestion(index: number): string {
  const questions = [
    "비용 대비 효과를 정량적으로 제시할 수 있나요? 반대 의견에 대응하기 위해 구체적인 수치가 도움이 될 것입니다.",
    "실제 적용 시 예상되는 장애물은 무엇이고, 이를 어떻게 극복할 계획인가요?",
    "변화에 따른 리스크를 어떻게 최소화할 수 있을까요? 단계적 접근이나 대안이 있나요?"
  ]
  return questions[index % questions.length]
}
