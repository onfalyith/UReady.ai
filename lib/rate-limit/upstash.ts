import { createHash } from "crypto"
import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"
import "server-only"

/** API JSON 본문·클라이언트 처리용 공통 코드 */
export const RATE_LIMIT_ERROR_CODE = "RATE_LIMIT_EXCEEDED" as const

export type RateLimitDenied = {
  message: string
  limit: number
  remaining: number
  /** Unix ms — 윈도우 리셋 시각 */
  reset: number
  retryAfterSeconds: number
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return new Redis({ url, token })
}

const redis = getRedis()

const extractPerMin = parsePositiveInt(
  process.env.RATE_LIMIT_EXTRACT_PER_MIN,
  30
)
const analyzePerMin = parsePositiveInt(
  process.env.RATE_LIMIT_ANALYZE_PER_MIN,
  8
)

const uploadLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(extractPerMin, "1 m"),
      prefix: "uready:extract",
    })
  : null

const analyzeLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(analyzePerMin, "1 m"),
      prefix: "uready:analyze",
    })
  : null

function toDenied(
  res: Awaited<ReturnType<NonNullable<typeof uploadLimiter>["limit"]>>,
  message: string
): RateLimitDenied {
  const retryAfterSeconds = Math.max(
    0,
    Math.ceil((res.reset - Date.now()) / 1000)
  )
  return {
    message,
    limit: res.limit,
    remaining: res.remaining,
    reset: res.reset,
    retryAfterSeconds,
  }
}

export function getRateLimitId(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "anonymous"
  return ip
}

/** DB meta 등에 IP 원문 대신 넣기 위한 SHA-256 해시 */
export function getRequestFingerprint(request: Request): string {
  return createHash("sha256").update(getRateLimitId(request)).digest("hex")
}

export type RateLimitOk = { ok: true }
export type RateLimitResult = RateLimitOk | { ok: false; denied: RateLimitDenied }

export async function rateLimitExtract(request: Request): Promise<RateLimitResult> {
  if (!uploadLimiter) return { ok: true }
  const id = getRateLimitId(request)
  const res = await uploadLimiter.limit(id)
  if (!res.success) {
    return {
      ok: false,
      denied: toDenied(
        res,
        "추출 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요."
      ),
    }
  }
  return { ok: true }
}

export async function rateLimitAnalyze(request: Request): Promise<RateLimitResult> {
  if (!analyzeLimiter) return { ok: true }
  const id = getRateLimitId(request)
  const res = await analyzeLimiter.limit(id)
  if (!res.success) {
    return {
      ok: false,
      denied: toDenied(
        res,
        "분석 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요."
      ),
    }
  }
  return { ok: true }
}

/** extract-pdf 라우트용 429 JSON + Retry-After */
export function extractPdfRateLimitResponse(denied: RateLimitDenied) {
  return Response.json(
    {
      success: false,
      error: denied.message,
      code: RATE_LIMIT_ERROR_CODE,
      limit: denied.limit,
      remaining: denied.remaining,
      reset: denied.reset,
      retryAfterSeconds: denied.retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(denied.retryAfterSeconds),
      },
    }
  )
}

/** analyze 라우트용 429 JSON + Retry-After */
export function analyzeRateLimitResponse(denied: RateLimitDenied) {
  return Response.json(
    {
      error: denied.message,
      code: RATE_LIMIT_ERROR_CODE,
      limit: denied.limit,
      remaining: denied.remaining,
      reset: denied.reset,
      retryAfterSeconds: denied.retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(denied.retryAfterSeconds),
      },
    }
  )
}
