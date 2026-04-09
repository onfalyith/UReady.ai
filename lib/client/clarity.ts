"use client"

import Clarity from "@microsoft/clarity"

/**
 * 사용자·세션 식별. 레이아웃의 Clarity 부트스트랩 스크립트 로드 이후 호출하는 것이 안전합니다.
 * @param customId 필수. 나머지는 선택.
 * @see https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-api
 */
export function clarityIdentify(
  customId: string,
  customSessionId?: string,
  customPageId?: string,
  friendlyName?: string
): void {
  Clarity.identify(customId, customSessionId, customPageId, friendlyName)
}

/**
 * 사용자 지정 태그(대시보드 필터·세그먼트). `init` 이후 호출.
 * @example claritySetTag("plan", "pro")
 */
export function claritySetTag(key: string, value: string | string[]): void {
  Clarity.setTag(key, value)
}
