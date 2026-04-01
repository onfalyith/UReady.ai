"use client"

import { useEffect, useState } from "react"
import { Search, AlertTriangle, MessageSquareWarning } from "lucide-react"

const loadingMessages = [
  "논리 구조를 분석하고 있습니다...",
  "주장과 근거를 검토하고 있습니다...",
  "반론 가능성을 탐색하고 있습니다...",
  "취약한 논점을 찾고 있습니다...",
  "개선 방향을 정리하고 있습니다...",
]

export function ScanningLoader() {
  const [messageIndex, setMessageIndex] = useState(0)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const messageInterval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % loadingMessages.length)
    }, 2000)

    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95) return prev
        return prev + Math.random() * 15
      })
    }, 500)

    return () => {
      clearInterval(messageInterval)
      clearInterval(progressInterval)
    }
  }, [])

  return (
    <div className="w-full max-w-lg mx-auto px-4 py-12 md:py-24">
      <div className="flex flex-col items-center text-center">
        {/* Animated Scanner */}
        <div className="relative mb-8">
          <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center">
            <Search className="h-10 w-10 text-primary animate-pulse" />
          </div>
          
          {/* Orbiting icons */}
          <div className="absolute inset-0 animate-spin" style={{ animationDuration: "4s" }}>
            <div className="absolute -top-2 left-1/2 -translate-x-1/2">
              <div className="h-8 w-8 rounded-full bg-[var(--highlight-weakness)] flex items-center justify-center shadow-sm">
                <AlertTriangle className="h-4 w-4 text-[var(--highlight-weakness-text)]" />
              </div>
            </div>
          </div>
          
          <div className="absolute inset-0 animate-spin" style={{ animationDuration: "4s", animationDelay: "-2s" }}>
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2">
              <div className="h-8 w-8 rounded-full bg-[var(--highlight-counter)] flex items-center justify-center shadow-sm">
                <MessageSquareWarning className="h-4 w-4 text-[var(--highlight-counter-text)]" />
              </div>
            </div>
          </div>
        </div>

        <h2 className="text-xl md:text-2xl font-semibold mb-2">
          허점을 분석하고 있습니다
        </h2>
        
        <p className="text-muted-foreground mb-6 h-6 transition-all duration-300">
          {loadingMessages[messageIndex]}
        </p>

        {/* Progress bar */}
        <div className="w-full max-w-xs bg-muted rounded-full h-2 overflow-hidden">
          <div 
            className="bg-primary h-full transition-all duration-500 ease-out rounded-full"
            style={{ width: `${Math.min(progress, 95)}%` }}
          />
        </div>
        
        <p className="text-sm text-muted-foreground mt-3">
          잠시만 기다려주세요...
        </p>
      </div>
    </div>
  )
}
