"use client"

import type { ReactNode } from "react"

type SharedNavProps = {
  variant?: "default" | "results"
  right?: ReactNode
  onLogoClick: () => void
  /** 업로드 화면: 디자인 시스템 Primary 적용 시 true */
  useDsPrimaryBrand?: boolean
  /** true면 로고 박스와 Ready.ai 사이 간격을 좁게 (gap-1). 기본 true */
  tightLogoTextGap?: boolean
}

export function SharedNav({
  variant = "default",
  onLogoClick,
  right,
  useDsPrimaryBrand = false,
  tightLogoTextGap = true,
}: SharedNavProps) {
  const logoTextGap = tightLogoTextGap ? "gap-1" : "gap-2"

  const logoBoxClass = useDsPrimaryBrand
    ? "bg-primary text-primary-foreground"
    : "bg-uready-red text-white"
  const accentClass = useDsPrimaryBrand ? "text-primary" : "text-uready-red"

  return (
    <nav
      className={`sticky top-0 z-[100] flex h-14 shrink-0 items-center justify-between border-b border-uready-gray-200 bg-white px-4 sm:px-8 ${
        variant === "results" ? "sm:h-[52px]" : ""
      }`}
    >
      <button
        type="button"
        onClick={onLogoClick}
        className={`flex cursor-pointer items-center border-0 bg-transparent p-0 text-left ${logoTextGap}`}
      >
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base font-black tracking-tight ${logoBoxClass}`}
        >
          U
        </div>
        <span className="text-[17px] font-bold tracking-tight text-uready-gray-900">
          Ready<span className={accentClass}>.ai</span>
        </span>
      </button>
      {right ? (
        <div className="flex items-center gap-2.5">{right}</div>
      ) : null}
    </nav>
  )
}
