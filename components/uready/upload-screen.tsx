"use client"

import { useRef, useState, type ChangeEvent, type DragEvent } from "react"
import { Loader2 } from "lucide-react"
import { SharedNav } from "./shared-nav"

type UploadScreenProps = {
  /** 직접 입력란에만 표시 */
  textareaDraft: string
  selectedFile: File | null
  extractingDocument: boolean
  /** 심층 점검(4단계 파이프라인) */
  deepInspectionMode: boolean
  onDeepInspectionModeChange: (value: boolean) => void
  /** `/api/analyze` 실패 시 표시 */
  analysisError?: string | null
  onDismissAnalysisError?: () => void
  onTextareaChange: (value: string) => void
  onDocumentFile: (file: File) => void
  onStart: () => void
  onLogoClick: () => void
}

export function UploadScreen({
  textareaDraft,
  selectedFile,
  extractingDocument,
  deepInspectionMode,
  onDeepInspectionModeChange,
  analysisError,
  onDismissAnalysisError,
  onTextareaChange,
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
  const fileSelected = selectedFile !== null
  const showFileTitle = fileSelected && !busy
  const dualHint =
    fileSelected && textareaDraft.trim().length > 0

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
          과제 제출 전, AI가 만든 자료가 불안할 때
        </div>

        <h1 className="mb-5 max-w-[700px] text-[clamp(28px,5vw,46px)] font-black leading-tight tracking-tight text-uready-gray-900">
          이 부분, 질문 들어오면
          <br />
          <span className="text-primary">어떻게 답하지?</span>
        </h1>

        <p className="mb-12 max-w-[520px] whitespace-pre-line text-[clamp(14px,2vw,16px)] leading-relaxed text-uready-gray-500">
          {`AI로 만든 발표 대본이나 자료를 넣으면,
외부 질문에 막힐 문장, 출처가 불분명한 주장,
내가 제대로 이해하지 못한 부분부터 먼저 짚어드립니다.`}
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
                발표 대본
              </label>
              {dualHint ? (
                <p className="mb-2 text-left text-[11px] leading-relaxed text-uready-gray-400">
                  대본과 발표 자료를 함께 보내면 말할 내용·화면 자료를 묶어서
                  검토합니다.
                </p>
              ) : null}
              <textarea
                value={textareaDraft}
                onChange={(e) => onTextareaChange(e.target.value)}
                disabled={busy}
                placeholder={`텍스트를 여기에 붙여 넣으세요.
(예: 안녕하십니까 이번 발표 주제를 선정한 이유는 다음과 같은 현상에 주목하여...)`}
                rows={6}
                className="h-[140px] w-full resize-none rounded-[10px] border border-uready-gray-200 bg-uready-gray-50 px-3.5 py-3.5 text-sm text-uready-gray-700 outline-none transition-colors placeholder:text-uready-gray-400 focus:border-primary focus:bg-white disabled:cursor-not-allowed disabled:opacity-70"
              />
            </div>

            <div className="flex flex-col gap-3 p-6">
              <span className="block text-xs font-semibold uppercase tracking-wider text-uready-gray-500">
                발표 자료
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
                {showFileTitle ? (
                  <>
                    <span
                      className="max-w-full truncate px-1 text-[14px] font-semibold text-uready-gray-900"
                      title={selectedFile.name}
                    >
                      {selectedFile.name}
                    </span>
                    <span className="text-[11px] leading-snug text-uready-gray-400">
                      다른 파일로 바꾸려면 이 영역을 눌러 주세요
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-[13px] font-medium text-uready-gray-500">
                      파일 크기는 15MB 미만, 텍스트가 포함되어야 해요
                    </span>
                    <span className="text-[11px] leading-snug text-uready-gray-400">
                      PDF나 TXT 파일을 넣으면 질문받을 수 있는 부분을 먼저
                      짚어드립니다
                    </span>
                  </>
                )}
              </button>
            </div>

            <div className="col-span-1 space-y-3 border-t border-uready-gray-200 px-6 pb-6 pt-4 md:col-span-2">
              <label className="flex cursor-pointer items-start gap-3 text-left">
                <input
                  type="checkbox"
                  checked={deepInspectionMode}
                  disabled={busy}
                  onChange={(e) =>
                    onDeepInspectionModeChange(e.target.checked)
                  }
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-uready-gray-300 text-primary focus:ring-primary"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-uready-gray-800">
                    심층 점검 모드
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-uready-gray-500">
                    해당 모드 체크 시 보다 정교한 분석이 진행되며, 소요시간이
                    길어질 수 있습니다.(유료 예정 기능)
                  </span>
                </span>
              </label>
              <button
                type="button"
                onClick={onStart}
                disabled={busy}
                className="mx-auto block w-full max-w-sm rounded-[10px] bg-primary py-3.5 text-[15px] font-bold tracking-tight text-primary-foreground transition-all hover:bg-primary-hover hover:shadow-[0_4px_16px_rgba(211,45,47,0.3)] active:translate-y-0 disabled:pointer-events-none disabled:opacity-50"
              >
                내 발표에서 막힐 부분 찾기
              </button>
            </div>
          </div>

        </div>
      </main>
    </div>
  )
}
