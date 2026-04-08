/** 모든 화면 문서 흐름 최하단 면책·안내 (스크롤 끝까지 내려가면 노출) */
export function AppLegalFooter() {
  return (
    <footer
      className="border-t border-uready-gray-200 bg-uready-gray-50 px-4 pt-5 pb-[56px] text-[11px] leading-relaxed text-uready-gray-600"
      role="contentinfo"
    >
      <div className="mx-auto max-w-3xl">
        <p className="mb-3 text-sm font-bold text-uready-gray-900">
          👀 이건 알고 쓰기로 해요
        </p>
        <ul className="m-0 list-disc space-y-2 pl-4">
          <li>
            현재는 베타 테스트 중이며, 일부 결과는 예시 또는 테스트용 분석
            형태로 제공될 수 있습니다.
          </li>
          <li>
            AI의 검증 결과는 완벽하지 않을 수 있으며, 부정확한 정보가 포함될 수
            있습니다. 사실 교차 검증 및 내용 개선 보조 도구로만 활용하세요.
          </li>
          <li>
            정보의 최종적인 사실 확인 및 발표 결과에 대한 모든 책임은 사용자
            본인에게 있습니다. UReady.ai는 스스로 답을 찾아 나가는 확장적 사고를
            돕습니다.
          </li>
          <li>
            UReady.ai는 입력받은 모든 내용을 일회성 분석 결과 제공 목적으로만
            검토하며, 결과 제공 화면 이탈 시 모든 기록을 삭제합니다.
          </li>
        </ul>
      </div>
    </footer>
  )
}
