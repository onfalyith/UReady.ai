"use client"

import { useRef, useState, type ChangeEvent, type DragEvent } from "react"
import { Loader2 } from "lucide-react"
import { SharedNav } from "./shared-nav"

type UploadScreenProps = {
  draftText: string
  dropzoneLabel: string
  extractingDocument: boolean
  /** `/api/analyze` 실패 시 표시 */
  analysisError?: string | null
  onDismissAnalysisError?: () => void
  onDraftTextChange: (value: string) => void
  onDocumentFile: (file: File) => void
  onStart: () => void
  onLogoClick: () => void
}

export function UploadScreen({
  draftText,
  dropzoneLabel,
  extractingDocument,
  analysisError,
  onDismissAnalysisError,
  onDraftTextChange,
  onDocumentFile,
  onStart,
  onLogoClick,
}: UploadScreenProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)

  const openPicker = () => {
    if (extractingDocument) return
    inputRef.current?.click()
  }

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) void onDocumentFile(f)
    e.target.value = ""
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    if (extractingDocument) return
    const f = e.dataTransfer.files[0]
    if (f) void onDocumentFile(f)
  }

  const busy = extractingDocument

  return (
    <div className="flex min-h-screen flex-col bg-uready-gray-50">
      <SharedNav useDsPrimaryBrand onLogoClick={onLogoClick} />

      {analysisError ? (
        <div
          role="alert"
          className="mx-auto flex w-full max-w-[760px] items-start gap-3 border-b border-red-200 bg-red-50 px-4 py-3 text-left sm:px-6"
        >
          <p className="flex-1 text-sm text-red-900">{analysisError}</p>
          {onDismissAnalysisError ? (
            <button
              type="button"
              onClick={onDismissAnalysisError}
              className="shrink-0 rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-800 hover:bg-red-100"
            >
              닫기
            </button>
          ) : null}
        </div>
      ) : null}

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10 pb-12 text-center sm:px-6 sm:py-16">
        <div className="mb-6 inline-flex items-center gap-1.5 rounded-full bg-uready-red-light px-3 py-1 text-xs font-semibold tracking-wide text-primary">
          ✦ AI 발표 허점 스캐너
        </div>

        <h1 className="mb-5 max-w-[700px] text-[clamp(28px,5vw,46px)] font-black leading-tight tracking-tight text-uready-gray-900">
          이 부분, 질문 들어오면
          <br />
          <span className="text-primary">어떻게 답하지?</span>
        </h1>

        <p className="mb-12 max-w-[520px] text-[clamp(14px,2vw,16px)] leading-relaxed text-uready-gray-500">
          AI가 생성한 환각(Hallucination)과 논리적 취약점을{" "}
          <strong className="font-semibold text-uready-gray-900">
            평균 1분 안에
          </strong>{" "}
          찾아냅니다.
          <br />
          대학생{" "}
          <strong className="font-semibold text-uready-gray-900">
            10명 중 9명
          </strong>
          이 겪는 발표 불안, 내 것으로 준비하세요.
        </p>

        <div className="relative w-full max-w-[760px] overflow-hidden rounded-3xl border border-uready-gray-200 bg-white shadow-uready-md">
          {busy ? (
            <div
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-3xl bg-white/80 backdrop-blur-[2px]"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm font-semibold text-uready-gray-700">
                PDF에서 텍스트를 추출하는 중입니다…
              </p>
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2">
            <div className="border-b border-uready-gray-200 p-6 md:border-b-0 md:border-r">
              <label className="mb-2.5 block text-xs font-semibold uppercase tracking-wider text-uready-gray-500">
                발표 대본 (TXT)
              </label>
              <textarea
                value={draftText}
                onChange={(e) => onDraftTextChange(e.target.value)}
                disabled={busy}
                placeholder={`발표 대본을 여기에 붙여넣으세요.

예: '안녕하십니까 이번 발표 주제를 선정한 이유는 다음과 같은 현상에 주목하여...'`}
                rows={6}
                className="h-[140px] w-full resize-none rounded-[10px] border border-uready-gray-200 bg-uready-gray-50 px-3.5 py-3.5 text-sm text-uready-gray-700 outline-none transition-colors placeholder:text-uready-gray-400 focus:border-primary focus:bg-white disabled:cursor-not-allowed disabled:opacity-70"
              />
            </div>

            <div className="flex flex-col gap-3 p-6">
              <span className="block text-xs font-semibold uppercase tracking-wider text-uready-gray-500">
                프레젠테이션 자료 (PDF / TXT)
              </span>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.txt,application/pdf,text/plain"
                className="hidden"
                disabled={busy}
                onChange={onInputChange}
              />
              <button
                type="button"
                disabled={busy}
                onClick={openPicker}
                onDragOver={(e) => {
                  e.preventDefault()
                  if (!busy) setDragActive(true)
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={onDrop}
                className={`flex min-h-[100px] cursor-pointer flex-col items-center justify-center gap-2 rounded-[10px] border-[1.5px] border-dashed px-5 py-5 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  dragActive
                    ? "border-primary bg-uready-red-light"
                    : "border-highlight bg-uready-gray-50 hover:border-primary hover:bg-uready-red-light"
                } `}
              >
                {busy ? (
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                ) : (
                  <span className="text-2xl" aria-hidden>
                    ↑
                  </span>
                )}
                <span className="text-[13px] font-medium text-uready-gray-500">
                  {dropzoneLabel}
                </span>
                <span className="text-[11px] text-uready-gray-400">
                  클릭하거나 파일을 드래그하세요
                </span>
              </button>
            </div>

            <div className="col-span-1 border-t border-uready-gray-200 px-6 pb-6 pt-4 md:col-span-2">
              <button
                type="button"
                onClick={onStart}
                disabled={busy}
                className="mx-auto block w-full max-w-sm rounded-[10px] bg-primary py-3.5 text-[15px] font-bold tracking-tight text-primary-foreground transition-all hover:bg-primary-hover hover:shadow-[0_4px_16px_rgba(211,45,47,0.3)] active:translate-y-0 disabled:pointer-events-none disabled:opacity-50"
              >
                즉시 분석 시작하기
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5 border-t border-uready-gray-100 bg-uready-gray-50 px-6 py-3">
            <span className="text-xs text-uready-gray-400">
              지원 형식:{" "}
              <span className="font-medium text-uready-gray-500">
                텍스트(TXT) 직접 입력
              </span>{" "}
              ·{" "}
              <span className="font-medium text-uready-gray-500">
                PDF / TXT 업로드
              </span>
            </span>
          </div>
        </div>
      </main>
    </div>
  )
}
