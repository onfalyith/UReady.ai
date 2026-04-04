"use client"

import type { PresentationEvidence } from "@/types/analysis"

function stanceBadgeClass(stance: PresentationEvidence["stance"]) {
  if (stance === "supports") {
    return "bg-emerald-100 text-emerald-800 ring-emerald-200"
  }
  if (stance === "contradicts") {
    return "bg-red-100 text-red-800 ring-red-200"
  }
  return "bg-uready-gray-200 text-uready-gray-700 ring-uready-gray-300"
}

type EvidenceListProps = {
  items: PresentationEvidence[]
}

export function EvidenceList({ items }: EvidenceListProps) {
  if (items.length === 0) return null

  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {items.map((ev, i) => (
        <li
          key={`${ev.url}-${i}`}
          className="rounded-[10px] border border-uready-gray-200 bg-white px-4 py-3.5"
        >
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-uready-gray-900">
              {ev.title}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ring-inset ${stanceBadgeClass(ev.stance)}`}
            >
              {ev.stance}
            </span>
          </div>
          <p className="mb-2 text-sm leading-relaxed text-uready-gray-600">
            {ev.snippet}
          </p>
          <a
            href={ev.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex text-sm font-medium text-primary underline-offset-2 hover:underline"
          >
            링크 열기
          </a>
        </li>
      ))}
    </ul>
  )
}
