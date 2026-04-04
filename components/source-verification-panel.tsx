"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { SourceVerificationReport } from "@/lib/types"
import { AlertTriangle, CheckCircle2, XCircle, Hash, Globe } from "lucide-react"

export function SourceVerificationPanel({
  report,
  onBack,
}: {
  report: SourceVerificationReport | null
  onBack?: () => void
}) {
  const overall = report?.overall

  const badge =
    overall === "pass" ? (
      <Badge variant="secondary" className="gap-1.5">
        <CheckCircle2 className="h-3.5 w-3.5" />
        출처 검증 통과
      </Badge>
    ) : overall === "block" ? (
      <Badge variant="destructive" className="gap-1.5">
        <XCircle className="h-3.5 w-3.5" />
        출처 검증 실패(분석 중단 권장)
      </Badge>
    ) : (
      <Badge variant="secondary" className="gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5" />
        출처 검증 경고
      </Badge>
    )

  return (
    <Card className="border-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-base md:text-lg flex items-center justify-between gap-3">
          <span>출처 존재/공신력 검증</span>
          {report ? badge : null}
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-0">
        {!report ? (
          <p className="text-sm text-muted-foreground">검증 결과를 불러오는 중입니다...</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4">{report.summary}</p>

            {report.items.length > 0 ? (
              <div className="space-y-3">
                {report.items.map((item) => (
                  <div
                    key={item.citation.id}
                    className="rounded-lg border bg-background/40 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2">
                        {item.citation.type === "doi" ? (
                          <Hash className="h-4 w-4 text-muted-foreground mt-0.5" />
                        ) : item.citation.type === "url" ? (
                          <Globe className="h-4 w-4 text-muted-foreground mt-0.5" />
                        ) : null}
                        <div>
                          <p className="text-sm font-medium break-all">
                            {item.citation.doi ?? item.citation.url ?? item.citation.raw}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            신뢰도: {item.credibility.label} (score {Math.round(item.credibility.score * 100)}/100)
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {item.existence.status === "exists" ? (
                          <Badge variant="secondary">존재</Badge>
                        ) : item.existence.status === "not_found" ? (
                          <Badge variant="destructive">미존재</Badge>
                        ) : item.existence.status === "error" ? (
                          <Badge variant="destructive">오류</Badge>
                        ) : (
                          <Badge variant="secondary">미확인</Badge>
                        )}
                      </div>
                    </div>

                    {item.existence.note ? (
                      <p className="text-xs text-muted-foreground mt-2">
                        {item.existence.note}
                      </p>
                    ) : null}

                    {item.credibility.signals?.length ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {item.credibility.signals.slice(0, 4).map((s, idx) => (
                          <Badge key={`${s}-${idx}`} variant="outline">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                추출된 URL/DOI 후보가 없습니다.
              </p>
            )}

            {report.limitations?.length ? (
              <div className="mt-4 p-3 rounded-lg bg-muted/30 border">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  자동 검증 한계
                </p>
                <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-5">
                  {report.limitations.slice(0, 5).map((l, idx) => (
                    <li key={`${idx}-${l}`}>{l}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {report.overall === "block" && onBack ? (
              <div className="mt-4">
                <Button variant="outline" onClick={onBack} className="w-full">
                  입력으로 돌아가기
                </Button>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}

