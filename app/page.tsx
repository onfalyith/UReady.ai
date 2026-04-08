"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { UploadScreen } from "@/components/uready/upload-screen"
import { LoadingScreen } from "@/components/uready/loading-screen"
import { ResultScreen } from "@/components/result-screen"
import {
  createInitialUReadyState,
  getDisplayFilename,
  resolveSourceKind,
} from "@/lib/uready/state"
import type { UReadyAppState } from "@/lib/uready/types"
import { analyzePresentationText } from "@/lib/api/analysis-client"
import { extractPdfForUpload } from "@/lib/api/extract-pdf-client"
import { readTextFileWithFileReader } from "@/lib/client/read-text-file"
import {
  isPdfFile,
  isTxtFile,
  validateUploadDocument,
} from "@/lib/client/upload-document"
import {
  countSignificantChars,
  MIN_ANALYSIS_SIGNIFICANT_CHARS,
} from "@/lib/uready/analysis-limits"

export default function Home() {
  const [state, setState] = useState<UReadyAppState>(createInitialUReadyState)
  const analyzeRequestId = useRef(0)

  const resetToUpload = useCallback(() => {
    analyzeRequestId.current += 1
    setState(createInitialUReadyState())
  }, [])

  const dismissAnalysisError = useCallback(() => {
    setState((s) => ({ ...s, analysisError: null }))
  }, [])

  const handleDocumentFile = useCallback(async (file: File) => {
    const v = validateUploadDocument(file)
    if (!v.ok) {
      window.alert(v.message)
      return
    }

    if (isTxtFile(file)) {
      try {
        const text = await readTextFileWithFileReader(file)
        setState((s) => ({
          ...s,
          draftText: text,
          selectedFile: file,
        }))
      } catch {
        window.alert(
          "텍스트 파일을 읽는 데 실패했습니다. 기존 대본 내용은 그대로입니다."
        )
      }
      return
    }

    if (isPdfFile(file)) {
      setState((s) => ({
        ...s,
        selectedFile: file,
        extractingDocument: true,
      }))
      const result = await extractPdfForUpload(file)
      setState((s) => ({
        ...s,
        extractingDocument: false,
        ...(result.success ? { draftText: result.text } : {}),
      }))
      if (!result.success) {
        window.alert(result.error)
      }
    }
  }, [])

  const startAnalysis = useCallback(() => {
    const kind = resolveSourceKind(state.draftText, state.selectedFile)
    if (kind === "none") {
      window.alert("발표 대본을 입력하거나 PDF 파일을 업로드해주세요.")
      return
    }

    const sig = countSignificantChars(state.draftText.trim())
    if (sig < MIN_ANALYSIS_SIGNIFICANT_CHARS) {
      window.alert(
        "분석할 내용이 없습니다.\n공백이 아닌 글자를 1자 이상 입력하거나, PDF/TXT에서 텍스트를 불러온 뒤 다시 시도해 주세요."
      )
      return
    }

    const displayFilename = getDisplayFilename(
      state.draftText,
      state.selectedFile
    )

    setState((s) => ({
      ...s,
      screen: "loading",
      sourceKind: kind,
      displayFilename,
      analysisError: null,
      analysisResult: null,
      analysisMaterialMeta: null,
    }))
  }, [state.draftText, state.selectedFile])

  useEffect(() => {
    if (state.screen !== "loading") return

    const id = ++analyzeRequestId.current
    const text = state.draftText

    void (async () => {
      const res = await analyzePresentationText(text)
      if (analyzeRequestId.current !== id) return

      if (!res.ok) {
        setState((s) => ({
          ...s,
          screen: "upload",
          analysisError: res.message,
        }))
        return
      }

      setState((s) => ({
        ...s,
        screen: "result",
        analysisResult: res.data,
        analysisMaterialMeta: res.materialMeta ?? null,
      }))
    })()
  }, [state.screen, state.draftText])

  return (
    <>
      {state.screen === "upload" && (
        <UploadScreen
          draftText={state.draftText}
          extractingDocument={state.extractingDocument}
          analysisError={state.analysisError}
          onDismissAnalysisError={dismissAnalysisError}
          onDraftTextChange={(draftText) =>
            setState((s) => ({ ...s, draftText }))
          }
          onDocumentFile={handleDocumentFile}
          onStart={startAnalysis}
          onLogoClick={resetToUpload}
        />
      )}

      {state.screen === "loading" && (
        <LoadingScreen
          displayFilename={state.displayFilename}
          onLogoClick={resetToUpload}
        />
      )}

      {state.screen === "result" && state.analysisResult ? (
        <ResultScreen
          displayFilename={state.displayFilename}
          sourceText={state.draftText}
          analysis={state.analysisResult}
          materialMeta={state.analysisMaterialMeta}
          onReset={resetToUpload}
          onLogoClick={resetToUpload}
        />
      ) : null}
    </>
  )
}
