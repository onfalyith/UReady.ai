"use client"

import { useEffect, useMemo, useState } from "react"
import type { PresentationEvidence } from "@/types/analysis"

function stanceBadgeClass(stance: PresentationEvidence["stance"]) {
  if (stance === "근거 확인") {
    return "bg-emerald-100 text-emerald-800 ring-emerald-200"
  }
  if (stance === "근거 다름") {
    return "bg-red-100 text-red-800 ring-red-200"
  }
  return "bg-uready-gray-200 text-uready-gray-700 ring-uready-gray-300"
}

type EvidenceSource =
  | "fetch"
  | "wayback"
  | "search"
  | "domain_home"

type ResolvedCell =
  | { type: "ok"; finalUrl: string; pageTitle: string | null; source?: EvidenceSource }
  | { type: "excluded" }
  | { type: "err"; reason: string; googleSearchUrl?: string }

type ApiResult = {
  inputUrl: string
  ok: boolean
  finalUrl?: string
  pageTitle?: string | null
  source?: EvidenceSource
  excludeFromEvidence?: boolean
  reason?: string
  googleSearchUrl?: string
}

type EvidenceListProps = {
  items: PresentationEvidence[]
}

function recoveryCaption(source?: EvidenceSource): string | null {
  if (source === "wayback") return "Internet Archive에 보관된 페이지로 연결했습니다."
  if (source === "search") return "웹 검색으로 찾은 유사·동일 페이지로 연결했습니다."
  if (source === "domain_home")
    return "메인 페이지에서 근거 문구가 확인되어 해당 사이트로 연결했습니다."
  return null
}

export function EvidenceList({ items }: EvidenceListProps) {
  const [resolvedByUrl, setResolvedByUrl] = useState<
    Record<string, ResolvedCell | undefined>
  >({})

  const resolvePayloadKey = useMemo(() => {
    const urls = items.map((i) => i.url.trim())
    const hints: Record<string, string> = {}
    const snippets: Record<string, string> = {}
    for (const ev of items) {
      const u = ev.url.trim()
      if (ev.title?.trim()) hints[u] = ev.title.trim()
      if (ev.snippet?.trim()) snippets[u] = ev.snippet.trim()
    }
    return `${urls.join("\0")}::${JSON.stringify(hints)}::${JSON.stringify(snippets)}`
  }, [items])

  useEffect(() => {
    if (items.length === 0) return

    const urls = [...new Set(items.map((i) => i.url.trim()))]
    const titleHints: Record<string, string> = {}
    const snippets: Record<string, string> = {}
    for (const ev of items) {
      const u = ev.url.trim()
      if (ev.title?.trim()) titleHints[u] = ev.title.trim()
      if (ev.snippet?.trim()) snippets[u] = ev.snippet.trim()
    }
    let cancelled = false

    setResolvedByUrl({})

    fetch("/api/resolve-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls, titleHints, snippets }),
    })
      .then(async (r) => {
        const data = (await r.json()) as {
          results?: ApiResult[]
          error?: string
        }
        if (cancelled) return

        if (!r.ok || !data.results) {
          const fallback: Record<string, ResolvedCell> = {}
          const msg =
            data.error ??
            "링크 정보를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요."
          for (const u of urls) {
            fallback[u] = { type: "err", reason: msg }
          }
          setResolvedByUrl(fallback)
          return
        }

        const next: Record<string, ResolvedCell> = {}
        for (const row of data.results) {
          if (row.ok && row.finalUrl) {
            next[row.inputUrl] = {
              type: "ok",
              finalUrl: row.finalUrl,
              pageTitle:
                row.pageTitle === undefined || row.pageTitle === null
                  ? null
                  : String(row.pageTitle),
              source: row.source,
            }
          } else if (row.excludeFromEvidence) {
            next[row.inputUrl] = { type: "excluded" }
          } else {
            next[row.inputUrl] = {
              type: "err",
              reason: row.reason ?? "링크를 열 수 없습니다.",
              googleSearchUrl: row.googleSearchUrl,
            }
          }
        }
        setResolvedByUrl(next)
      })
      .catch(() => {
        if (cancelled) return
        const fallback: Record<string, ResolvedCell> = {}
        const msg =
          "링크 정보를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요."
        for (const u of urls) {
          fallback[u] = { type: "err", reason: msg }
        }
        setResolvedByUrl(fallback)
      })

    return () => {
      cancelled = true
    }
  }, [resolvePayloadKey])

  const allDone = useMemo(
    () =>
      items.length > 0 &&
      items.every((ev) => resolvedByUrl[ev.url.trim()] !== undefined),
    [items, resolvedByUrl]
  )

  const hasVisibleEvidence = useMemo(() => {
    if (!items.length) return false
    for (const ev of items) {
      const c = resolvedByUrl[ev.url.trim()]
      if (c === undefined) return true
      if (c.type !== "excluded") return true
    }
    return false
  }, [items, resolvedByUrl])

  if (items.length === 0) return null

  if (allDone && !hasVisibleEvidence) return null

  return (
    <>
      <div className="my-4 h-px bg-uready-gray-100" />
      <section>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-uready-gray-500">
          출처 및 근거
        </h3>
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {items
            .filter((ev) => {
              const c = resolvedByUrl[ev.url.trim()]
              return c === undefined || c.type !== "excluded"
            })
            .map((ev, i) => (
              <EvidenceItemRow
                key={`${ev.url}-${i}`}
                ev={ev}
                resolved={resolvedByUrl[ev.url.trim()]}
              />
            ))}
        </ul>
      </section>
    </>
  )
}

function EvidenceItemRow({
  ev,
  resolved,
}: {
  ev: PresentationEvidence
  resolved: ResolvedCell | undefined
}) {
  const displayTitle =
    resolved?.type === "ok"
      ? resolved.pageTitle?.trim() || ev.title
      : ev.title

  const caption =
    resolved?.type === "ok" ? recoveryCaption(resolved.source) : null

  return (
    <li className="rounded-[10px] border border-uready-gray-200 bg-white px-4 py-3.5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-uready-gray-900">
          {displayTitle}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${stanceBadgeClass(ev.stance)}`}
        >
          {ev.stance}
        </span>
      </div>
      <p className="mb-2 text-sm leading-relaxed text-uready-gray-600">
        {ev.snippet}
      </p>
      {resolved === undefined ? (
        <p className="text-sm text-uready-gray-500" aria-live="polite">
          링크 확인 중…
        </p>
      ) : resolved.type === "ok" ? (
        <div className="flex flex-col gap-1.5">
          <a
            href={resolved.finalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-fit text-sm font-medium text-primary underline-offset-2 hover:underline"
          >
            링크 열기
          </a>
          {caption ? (
            <p className="text-xs leading-relaxed text-uready-gray-500">
              {caption}
            </p>
          ) : null}
        </div>
      ) : resolved.type === "err" ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm leading-relaxed text-uready-gray-700">
            {resolved.reason}
          </p>
          {resolved.googleSearchUrl ? (
            <a
              href={resolved.googleSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit text-sm font-medium text-primary underline-offset-2 hover:underline"
            >
              Google에서 이 주소 검색
            </a>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}
