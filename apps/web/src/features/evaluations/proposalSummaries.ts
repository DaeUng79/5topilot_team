// 평가항목별 업체 제안서 요약 자료 구조.
// 향후 DaeUng79의 AI 제안서 분석(documents/ai) 결과를 같은 모양으로 받는다. 지금은 화면 확인용
// 예시 자료만 만들며, 실제 제안서에서 추출한 내용이 아니다. DB 테이블·API는 만들지 않았다.
// 평가위원이 입력하는 점수(evaluations)와는 완전히 분리된 읽기 전용 자료다.

import type { Project } from '../../api/client';

export type ProposalSummaryItem = {
  text: string; // 제안서 핵심 내용 1~2줄
  page: number; // 원문 제안서 페이지 번호
};

export type ProposalSummary = {
  project_id: string;
  vendor_id: string;
  criterion_id: string;
  items: ProposalSummaryItem[]; // 화면에는 최대 2개만 보여 준다
  source_document_id: string; // 원본 문서 ID
  source_revision: string; // 원본 문서 버전
  is_example: boolean; // true면 예시 자료. 화면에 반드시 표시한다
};

// 시작용 평가항목(apps/api DEFAULT_CRITERIA) 기준 예시 문구. 업체 순서에 따라 돌아가며 쓴다.
const EXAMPLE_LINES: Record<string, string[][]> = {
  understanding: [
    ['현행 시스템 문제점을 3개 영역으로 정리하고 개선 방향을 제시', '요구사항을 기능·비기능으로 분류한 대응표 제시'],
    ['사업 목표를 단계별 성과지표로 연결해 설명', '유사 사업 경험을 바탕으로 위험 요소 5건 식별'],
    ['발주기관 업무 흐름도를 재작성해 개선 지점 표시', '이해관계자별 기대효과를 표로 정리'],
  ],
  methodology: [
    ['2주 단위 반복 개발과 단계별 검수 절차 제시', '요구사항 추적표로 설계·구현·시험 연계'],
    ['단계형 모델에 프로토타입 검증 단계 추가', '품질보증 조직 독립 운영과 주간 품질회의'],
    ['표준 방법론 테일러링 결과와 산출물 목록 제시', '단계별 완료 기준을 명시'],
  ],
  technology: [
    ['웹 표준 기반 프레임워크 적용과 브라우저 호환 계획', '기존 DB 이관 절차와 검증 방식 제시'],
    ['서비스 분리 범위와 API 게이트웨이 구성안', '응답 3초 이내 성능 목표와 부하시험 계획'],
    ['컨테이너 기반 배포 구성으로 클라우드 전환 대비', '모니터링·로그 수집 체계 구성안'],
  ],
  security: [
    ['개인정보 암호화·접근통제 적용 범위 제시', '보안 취약점 점검 2회와 조치 계획'],
    ['보안 요구사항 대응표 제시', '관리자 권한 분리와 감사 로그 보관 기간 명시'],
    ['소스코드 보안약점 진단 도구 적용 계획', '침해사고 대응 절차와 보고 체계'],
  ],
  schedule: [
    ['총 10개월, 마일스톤 4개와 검수 시점 제시', '지연 위험 대비 예비 기간 2주 확보'],
    ['주간 진척 보고와 지연 시 보강 투입 계획', '핵심 경로 작업 식별'],
    ['단계 병행 수행으로 일정 단축안 제시', '발주기관 검토 기간을 일정에 반영'],
  ],
  staffing: [
    ['PM 1명·개발 6명·품질 1명, 고급 기술자 비율 40%', '핵심 인력 교체 시 사전 승인 절차 명시'],
    ['분야별 전담 인력 배치표와 투입 기간 제시', '유사 사업 수행 경력 요약 첨부'],
    ['설계 단계에 아키텍트 집중 투입', '상주 인력과 비상주 지원 인력 구분'],
  ],
  support: [
    ['무상 유지보수 12개월, 장애 대응 4시간 이내', '운영자·사용자 교육 각 2회 계획'],
    ['운영 매뉴얼·교육 교재 제공과 원격 지원 체계', '하자보수 기간 중 월간 점검 보고'],
    ['전담 유지보수 인력 1명 지정', '교육 이수 확인과 FAQ 제공 계획'],
  ],
};

// 사업의 업체 수·평가항목이 달라져도 모든 (업체, 항목) 조합에 예시를 만든다.
export function exampleSummaries(project: Pick<Project, 'id' | 'vendor_ids' | 'criteria'>): ProposalSummary[] {
  return project.criteria.flatMap((criterion, ci) => project.vendor_ids.map((vendor_id, vi) => {
    const variants = EXAMPLE_LINES[criterion.id];
    const lines = variants ? variants[vi % variants.length] : [`${criterion.name} 항목에 대한 제안 내용 요약`, '원문 근거는 분석 연동 뒤 표시'];
    const base = 8 + ci * 6 + vi * 2;
    return {
      project_id: project.id,
      vendor_id,
      criterion_id: criterion.id,
      items: lines.map((text, k) => ({ text: `(예시) ${text}`, page: base + k * 3 })),
      source_document_id: `example-doc-${vendor_id}`,
      source_revision: 'example-v1',
      is_example: true,
    };
  }));
}

// 화면 확인용 예시를 보여 주는 사업. seed의 시작용 샘플(demo-project)뿐이다. 새로 등록한 사업은 실제 분석
// 결과가 연결되기 전까지 빈 목록이며, 화면은 업체 카드마다 "제안서 요약 정보가 없습니다."를 표시한다.
export const EXAMPLE_PROJECT_IDS = ['demo-project'];

// 연동 지점. 실제 분석 API(DaeUng79, AI 제안서 분석)가 생기면 이 함수만 바꾼다(응답 모양은 ProposalSummary 유지).
export async function loadProposalSummaries(project: Pick<Project, 'id' | 'vendor_ids' | 'criteria'>): Promise<ProposalSummary[]> {
  return EXAMPLE_PROJECT_IDS.includes(project.id) ? exampleSummaries(project) : [];
}
