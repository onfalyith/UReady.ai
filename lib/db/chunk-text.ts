import "server-only"

/**
 * 의미 단위(빈 줄) 우선 병합 후, 긴 단락만 하드 슬라이스.
 * `document_chunks` 한 행 ≈ 이후 임베딩 1건에 대응하기 좋게 유지합니다.
 */
export function chunkPlainText(
  text: string,
  maxChars = 2800,
  overlap = 200
): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim()
  if (!normalized) return []

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)

  const chunks: string[] = []
  let buf = ""

  const flush = () => {
    if (buf) chunks.push(buf)
    buf = ""
  }

  for (const p of paragraphs) {
    if (p.length > maxChars) {
      flush()
      for (let i = 0; i < p.length; i += maxChars - overlap) {
        chunks.push(p.slice(i, i + maxChars))
      }
      continue
    }
    if (!buf) buf = p
    else if (buf.length + p.length + 2 <= maxChars) buf = `${buf}\n\n${p}`
    else {
      flush()
      buf = p
    }
  }
  flush()
  return chunks
}
