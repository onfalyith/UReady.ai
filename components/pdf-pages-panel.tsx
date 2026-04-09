"use client"

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import { createPortal } from "react-dom"
import { PDFJS_BROWSER_WORKER_URL } from "@/lib/api/extract-pdf-client"
import { pageTextFromContent } from "@/lib/client/pdf-page-text"
import { findPageIndexForIssueQuote } from "@/lib/uready/build-source-segments"
import type { PresentationIssue } from "@/types/analysis"
import type { SourceTextPanelHandle } from "@/components/source-text-panel"
import { cn } from "@/lib/utils"

/** 패널 미리보기: 한 페이지가 차지하는 CSS 최대 너비(px) */
const PDF_PANEL_MAX_CSS_WIDTH = 560
/**
 * pdf.js viewport 배율 상한(포인트→CSS px 근사).
 * 올리면 더 선명하지만 메모리·렌더 비용이 늘어납니다.
 */
const PDF_PANEL_MAX_PAGE_SCALE = 3
/** 라이트박스: 화면에 맞출 때의 기본 배율 상한(창보다 큰 PDF는 여기까지) */
const PDF_LIGHTBOX_MAX_FIT_SCALE = 4

/** pdf.js getDocument().promise — 타입 추론용 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfJsDocument = any

type PdfPagesPanelProps = {
  file: File
  issues: PresentationIssue[]
  activeIssueIndex: number
  onActiveIssueIndexChange: (index: number) => void
  onNavigateIssue: (delta: -1 | 1) => void
  /** 이중 원문에서 상단 공통 네비를 쓸 때 false */
  showIssueNavigator?: boolean
  /** 페이지별 추출 텍스트 준비 시(허점 카드 p.n 등) */
  onPageTextsReady?: (pageTexts: string[]) => void
  /** 결과 화면 스티키 열 등에서 남는 높이를 채움(md 이상). 모바일은 기존 max-height 유지 */
  fillAvailableHeight?: boolean
}

export const PdfPagesPanel = forwardRef<
  SourceTextPanelHandle,
  PdfPagesPanelProps
>(function PdfPagesPanel(
  {
    file,
    issues,
    activeIssueIndex,
    onActiveIssueIndexChange,
    onNavigateIssue,
    showIssueNavigator = true,
    onPageTextsReady,
    fillAvailableHeight = false,
  },
  ref
) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [pdfDoc, setPdfDoc] = useState<PdfJsDocument | null>(null)
  const [pageTexts, setPageTexts] = useState<string[]>([])
  const [lightboxPage, setLightboxPage] = useState<number | null>(null)
  const pageWrapRefs = useRef<(HTMLDivElement | null)[]>([])
  const onPageTextsReadyRef = useRef(onPageTextsReady)
  onPageTextsReadyRef.current = onPageTextsReady

  const numPages = pdfDoc?.numPages ?? 0

  useEffect(() => {
    let cancelled = false
    pageWrapRefs.current = []

    ;(async () => {
      setStatus("loading")
      setErrorMessage(null)
      setPdfDoc(null)
      setPageTexts([])
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
        pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_BROWSER_WORKER_URL

        const data = new Uint8Array(await file.arrayBuffer())
        const pdf: PdfJsDocument = await pdfjs.getDocument({
          data,
          useSystemFonts: true,
        }).promise

        const texts: string[] = []
        const n = pdf.numPages as number
        for (let p = 1; p <= n; p++) {
          if (cancelled) return
          const page = await pdf.getPage(p)
          const textContent = await page.getTextContent()
          const raw = pageTextFromContent(
            textContent.items as Array<{ str?: string } & Record<string, unknown>>
          )
          texts.push(raw)
        }

        if (cancelled) return
        setPdfDoc(pdf)
        setPageTexts(texts)
        onPageTextsReadyRef.current?.(texts)
        setStatus("ready")
      } catch (e) {
        if (cancelled) return
        setStatus("error")
        setErrorMessage(e instanceof Error ? e.message : "PDF를 불러오지 못했습니다.")
      }
    })()

    return () => {
      cancelled = true
    }
  }, [file])

  const scrollToIssue = useCallback(
    (issueIndex: number) => {
      const issue = issues[issueIndex]
      if (!issue) return
      const pageIdx = findPageIndexForIssueQuote(pageTexts, issue.originalText)
      const el = pageWrapRefs.current[pageIdx]
      el?.scrollIntoView({ behavior: "smooth", block: "start" })
    },
    [issues, pageTexts]
  )

  useImperativeHandle(
    ref,
    () => ({
      scrollToIssue,
    }),
    [scrollToIssue]
  )

  const nIssues = issues.length

  if (status === "error") {
    return (
      <p className="m-0 rounded-xl border border-dashed border-uready-gray-200 bg-uready-gray-50 px-4 py-8 text-center text-sm text-uready-gray-500">
        {errorMessage ?? "PDF 미리보기를 불러오지 못했습니다."}
      </p>
    )
  }

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-uready-gray-200 bg-uready-gray-50/80",
        fillAvailableHeight
          ? "min-h-0 max-h-[min(55vh,520px)] md:h-full md:max-h-none md:flex-1"
          : "max-h-[min(55vh,520px)] md:max-h-[min(520px,calc(100vh-11rem))]"
      )}
    >
      {nIssues > 0 && showIssueNavigator ? (
        <div className="flex shrink-0 items-center justify-center gap-2 border-b border-uready-gray-200/80 px-3 py-2.5 sm:gap-3 sm:px-5">
          <button
            type="button"
            aria-label="이전 허점"
            onClick={() => onNavigateIssue(-1)}
            className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-uready-gray-200 bg-white text-sm font-semibold text-uready-gray-700 shadow-sm transition hover:bg-uready-gray-50"
          >
            ◀
          </button>
          <span className="min-w-[7.5rem] text-center text-sm font-semibold tabular-nums text-uready-gray-800">
            허점 {activeIssueIndex + 1} / {nIssues}
          </span>
          <button
            type="button"
            aria-label="다음 허점"
            onClick={() => onNavigateIssue(1)}
            className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-uready-gray-200 bg-white text-sm font-semibold text-uready-gray-700 shadow-sm transition hover:bg-uready-gray-50"
          >
            ▶
          </button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-3 sm:px-4 [scrollbar-gutter:stable]">
        {status === "loading" || !pdfDoc ? (
          <p className="m-0 py-10 text-center text-sm text-uready-gray-500">
            PDF 페이지를 그리는 중입니다…
          </p>
        ) : (
          <div className="space-y-4">
            {Array.from({ length: numPages }, (_, i) => (
              <PdfPageCanvas
                key={i + 1}
                pdf={pdfDoc}
                pageNumber={i + 1}
                totalPages={numPages}
                setWrapRef={(el) => {
                  pageWrapRefs.current[i] = el
                }}
                onOpenLightbox={() => setLightboxPage(i + 1)}
              />
            ))}
          </div>
        )}
      </div>

      {status === "ready" && numPages > 0 && nIssues > 0 ? (
        <p className="shrink-0 border-t border-uready-gray-200/80 px-4 py-2 text-[11px] leading-relaxed text-uready-gray-500 sm:px-5">
          ◀ ▶ 로 허점을 바꾸면 인용 문장이 있을 법한 페이지로 스크롤됩니다. 스캔 PDF는
          텍스트가 없어 첫 페이지로만 이동할 수 있습니다.
        </p>
      ) : null}

      {status === "ready" && pdfDoc && lightboxPage != null ? (
        <PdfPageLightbox
          pdf={pdfDoc}
          pageNumber={lightboxPage}
          onClose={() => setLightboxPage(null)}
        />
      ) : null}
    </div>
  )
})

function PdfPageLightbox({
  pdf,
  pageNumber,
  onClose,
}: {
  pdf: PdfJsDocument
  pageNumber: number
  onClose: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const page = await pdf.getPage(pageNumber)
        const base = page.getViewport({ scale: 1 })
        const navTop =
          typeof window !== "undefined" &&
          window.matchMedia("(min-width: 640px)").matches
            ? 52
            : 56
        const pad = 24
        const maxW = window.innerWidth - pad * 2
        const maxH = window.innerHeight - navTop - pad * 2
        const fitScale = Math.min(
          maxW / base.width,
          maxH / base.height,
          PDF_LIGHTBOX_MAX_FIT_SCALE
        )
        const dpr = window.devicePixelRatio || 1
        const viewport = page.getViewport({ scale: fitScale * dpr })

        const canvas = canvasRef.current
        if (!canvas || cancelled) return

        const ctx = canvas.getContext("2d")
        if (!ctx) {
          setErr("canvas를 사용할 수 없습니다.")
          return
        }

        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        canvas.style.width = `${Math.floor(viewport.width / dpr)}px`
        canvas.style.height = `${Math.floor(viewport.height / dpr)}px`

        await page.render({ canvasContext: ctx, viewport }).promise
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "렌더 실패")
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [pdf, pageNumber])

  if (typeof document === "undefined") return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`PDF ${pageNumber}페이지 확대`}
      className="fixed inset-x-0 bottom-0 z-[200] flex cursor-default items-center justify-center bg-black/80 p-6 top-14 sm:top-[52px]"
      onClick={onClose}
    >
      <div
        className="max-h-full max-w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {err ? (
          <p className="rounded-lg bg-white/10 px-4 py-3 text-sm text-white">
            {err}
          </p>
        ) : (
          <canvas
            ref={canvasRef}
            className="mx-auto block h-auto max-h-[min(calc(100vh-7rem),calc(100dvh-7rem))] w-auto max-w-full shadow-2xl"
          />
        )}
      </div>
    </div>,
    document.body
  )
}

type PdfPageCanvasProps = {
  pdf: PdfJsDocument
  pageNumber: number
  totalPages: number
  setWrapRef: (el: HTMLDivElement | null) => void
  onOpenLightbox?: () => void
}

function PdfPageCanvas({
  pdf,
  pageNumber,
  totalPages,
  setWrapRef,
  onOpenLightbox,
}: PdfPageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const page = await pdf.getPage(pageNumber)
        const base = page.getViewport({ scale: 1 })
        const fitScale = Math.min(
          PDF_PANEL_MAX_PAGE_SCALE,
          PDF_PANEL_MAX_CSS_WIDTH / base.width
        )
        const dpr =
          typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1
        const viewport = page.getViewport({ scale: fitScale * dpr })

        const canvas = canvasRef.current
        if (!canvas || cancelled) return

        const ctx = canvas.getContext("2d")
        if (!ctx) {
          setErr("canvas를 사용할 수 없습니다.")
          return
        }

        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        canvas.style.width = `${Math.floor(viewport.width / dpr)}px`
        canvas.style.height = `${Math.floor(viewport.height / dpr)}px`

        await page.render({ canvasContext: ctx, viewport }).promise
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "렌더 실패")
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [pdf, pageNumber])

  return (
    <div
      ref={setWrapRef}
      data-pdf-page={pageNumber - 1}
      className="overflow-hidden rounded-lg border border-uready-gray-200 bg-white shadow-sm"
    >
      <div className="border-b border-uready-gray-100 bg-uready-gray-50 px-3 py-1.5 text-center text-[11px] font-semibold tabular-nums text-uready-gray-600">
        {pageNumber} / {totalPages}
      </div>
      {err ? (
        <p className="m-0 px-3 py-6 text-center text-xs text-red-600">{err}</p>
      ) : (
        <button
          type="button"
          className="relative block w-full cursor-zoom-in border-0 bg-transparent p-0"
          aria-label={`PDF ${pageNumber}페이지 크게 보기`}
          onClick={() => onOpenLightbox?.()}
        >
          <canvas
            ref={canvasRef}
            className="mx-auto block h-auto w-full max-w-full"
            aria-hidden
          />
        </button>
      )}
    </div>
  )
}
