"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { FileText, Upload, X, Search, Sparkles, Loader2 } from "lucide-react"
import { extractPdfViaApi } from "@/lib/api/extract-pdf-client"

function readTextFileWithFileReader(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const r = reader.result
      resolve(typeof r === "string" ? r : "")
    }
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"))
    reader.readAsText(file, "UTF-8")
  })
}

interface MainInputProps {
  onScan: (payload: { content: string }) => void
}

export function MainInput({ onScan }: MainInputProps) {
  const [activeTab, setActiveTab] = useState<"text" | "file">("text")
  const [textContent, setTextContent] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [fileContent, setFileContent] = useState("")
  const [error, setError] = useState("")
  const [isDragging, setIsDragging] = useState(false)
  const [isParsingPdf, setIsParsingPdf] = useState(false)
  const [pdfStage, setPdfStage] = useState<"text" | "unstructured">("text")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (selectedFile: File) => {
    setError("")

    const name = selectedFile.name.toLowerCase()
    const isTxt =
      selectedFile.type === "text/plain" || name.endsWith(".txt")
    const isPdf =
      selectedFile.type === "application/pdf" ||
      selectedFile.type === "application/x-pdf" ||
      name.endsWith(".pdf")

    if (!isTxt && !isPdf) {
      setError("txt 또는 PDF만 업로드 가능합니다")
      return
    }

    setFile(null)

    if (isTxt) {
      setFileContent("")
      try {
        setFile(selectedFile)
        const text = await readTextFileWithFileReader(selectedFile)
        setFileContent(text)
      } catch {
        setError("텍스트 파일을 읽지 못했습니다.")
        setFile(null)
      }
      return
    }

    const previousContent = fileContent
    setIsParsingPdf(true)
    setPdfStage("unstructured")
    setError("")
    try {
      const res = await extractPdfViaApi(selectedFile)
      if (!res.success) {
        setError(res.error)
        setFile(null)
        setFileContent(previousContent)
        return
      }
      setFile(selectedFile)
      setFileContent(res.text)
    } catch (e) {
      console.error(e)
      setError(
        e instanceof Error
          ? `PDF 읽기 실패: ${e.message}`
          : "PDF에서 텍스트를 읽는 중 오류가 발생했습니다."
      )
      setFile(null)
      setFileContent(previousContent)
    } finally {
      setIsParsingPdf(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (isParsingPdf) return
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) {
      handleFileChange(droppedFile)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (!isParsingPdf) setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const removeFile = () => {
    setFile(null)
    setFileContent("")
    setError("")
  }

  const handleScan = () => {
    const content = activeTab === "text" ? textContent : fileContent
    if (content.trim()) {
      onScan({ content })
    }
  }

  const isDisabled =
    isParsingPdf ||
    (activeTab === "text" ? !textContent.trim() : !fileContent.trim())

  return (
    <div className="w-full max-w-3xl mx-auto px-4">
      <div className="text-center mb-8 md:mb-12">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
          <Sparkles className="h-4 w-4" />
          발표 전 허점을 미리 발견하세요
        </div>
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight mb-4 text-balance">
          발표 자료의 <span className="text-primary">논리적 허점</span>을 찾아드립니다
        </h1>
        <p className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto text-pretty">
          AI가 만든 발표 자료도 괜찮습니다. 논리적 취약점과 예상 반론을 미리 파악하고, 질문에 자신있게 대답하세요.
        </p>
      </div>

      <Card className="border-2">
        <CardContent className="p-4 md:p-6">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "text" | "file")}>
            <TabsList className="w-full mb-4">
              <TabsTrigger value="text" className="flex-1 gap-2">
                <FileText className="h-4 w-4" />
                텍스트 입력
              </TabsTrigger>
              <TabsTrigger value="file" className="flex-1 gap-2">
                <Upload className="h-4 w-4" />
                파일 업로드
              </TabsTrigger>
            </TabsList>

            <TabsContent value="text" className="mt-0">
              <Textarea
                placeholder="발표 자료 내용을 붙여넣으세요..."
                className="min-h-[200px] md:min-h-[280px] resize-none text-base"
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
              />
            </TabsContent>

            <TabsContent value="file" className="mt-0">
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.pdf"
                className="hidden"
                disabled={isParsingPdf}
                onChange={(e) => {
                  const selectedFile = e.target.files?.[0]
                  if (selectedFile) handleFileChange(selectedFile)
                }}
              />
              
              {!file ? (
                <div
                  className={`border-2 border-dashed rounded-lg p-8 md:p-12 text-center transition-colors min-h-[200px] md:min-h-[280px] flex flex-col items-center justify-center ${
                    isDragging 
                      ? "border-primary bg-primary/5" 
                      : "border-muted-foreground/25 hover:border-primary/50"
                  }`}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                >
                  {isParsingPdf ? (
                    <>
                      <Loader2 className="h-10 w-10 text-primary mb-4 animate-spin" />
                      <p className="text-muted-foreground mb-2">
                        {pdfStage === "text"
                          ? "PDF에서 텍스트를 읽는 중…"
                          : "Unstructured로 텍스트를 추출하는 중…"}
                      </p>
                    </>
                  ) : (
                    <>
                      <Upload className="h-10 w-10 text-muted-foreground mb-4" />
                      <p className="text-muted-foreground mb-2">
                        파일을 드래그하거나 클릭하여 업로드
                      </p>
                      <p className="text-sm text-muted-foreground/70 mb-4">
                        .txt, .pdf 파일 지원
                      </p>
                      <Button 
                        variant="outline" 
                        onClick={() => fileInputRef.current?.click()}
                      >
                        파일 선택
                      </Button>
                    </>
                  )}
                </div>
              ) : (
                <div className="border rounded-lg p-4 min-h-[200px] md:min-h-[280px]">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <FileText className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(file.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={removeFile}
                      className="h-8 w-8"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="bg-muted/50 rounded-md p-3 max-h-[220px] overflow-y-auto">
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {fileContent.slice(0, 4000)}
                      {fileContent.length > 4000 && "…"}
                    </p>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>

          {error && (
            <p className="text-destructive text-sm mt-3">{error}</p>
          )}

          <Button 
            className="w-full mt-4 h-12 text-base font-semibold gap-2"
            onClick={handleScan}
            disabled={isDisabled}
          >
            {isParsingPdf ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Search className="h-5 w-5" />
            )}
            허점 스캔하기
          </Button>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground mt-6">
        업로드된 자료는 분석 후 즉시 삭제됩니다. 개인정보를 보호합니다.
      </p>
    </div>
  )
}
