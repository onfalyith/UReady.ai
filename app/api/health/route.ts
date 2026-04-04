import { NextResponse } from "next/server"

/** 연결·배포 확인용. 추후 인증·DB 헬스를 확장하기 쉬운 최소 엔드포인트 */
export async function GET() {
  return NextResponse.json({ ok: true, service: "uready-cursor" })
}
