/** 스키마 플레이스홀더·검색 무관 더미 URL — 출처 UI에 포함하지 않음 */
export function isPlaceholderEvidenceUrl(url: string): boolean {
  const u = url.trim()
  if (!u) return true
  try {
    const parsed = new URL(u)
    const host = parsed.hostname.toLowerCase()
    if (host === "example.com" || host === "www.example.com") return true
    return false
  } catch {
    return true
  }
}

export function filterSubstantiveEvidence<T extends { url: string }>(
  items: T[]
): T[] {
  return items.filter(
    (e) =>
      !isPlaceholderEvidenceUrl(e.url) && /^https?:\/\//i.test(e.url.trim())
  )
}
