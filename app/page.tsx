"use client"

import { useState } from "react"
import { Header } from "@/components/header"
import { MainInput } from "@/components/main-input"
import { ScanningLoader } from "@/components/scanning-loader"
import { ScanResult } from "@/components/scan-result"
import { Toaster } from "@/components/ui/sonner"
import { AppState, ScanResult as ScanResultType } from "@/lib/types"
import { mockScanContent } from "@/lib/mock-scan"

export default function Home() {
  const [appState, setAppState] = useState<AppState>("input")
  const [scanResult, setScanResult] = useState<ScanResultType | null>(null)

  const handleScan = async (content: string) => {
    setAppState("scanning")
    
    try {
      const result = await mockScanContent(content)
      setScanResult(result)
      setAppState("result")
    } catch (error) {
      console.error("Scan failed:", error)
      setAppState("input")
    }
  }

  const handleReset = () => {
    setScanResult(null)
    setAppState("input")
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header onLogoClick={handleReset} />
      
      <main className="flex-1 py-8 md:py-12">
        {appState === "input" && (
          <MainInput onScan={handleScan} />
        )}
        
        {appState === "scanning" && (
          <ScanningLoader />
        )}
        
        {appState === "result" && scanResult && (
          <ScanResult result={scanResult} onReset={handleReset} />
        )}
      </main>
      
      <Toaster position="bottom-center" />
    </div>
  )
}
