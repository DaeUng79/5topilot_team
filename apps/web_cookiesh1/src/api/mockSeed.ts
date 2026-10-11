// 합성 시드 데이터(mock 전용). 실제 기관·인물·제안서가 아닙니다. 전화번호는 010-0000-xxxx 가짜 형식만 씁니다.
import type { components } from './schema';
import type { Block, CriteriaRead, CriterionDraft, DocumentRead, Match } from './contract';

type S = components['schemas'];

export const SEED_VERSION = 3;
export const VENDORS = ['vendor-a', 'vendor-b', 'vendor-c'];
export const TECH_TOTAL = 80;

export interface Db {
  version: number;
  projects: (S['ProjectRead'] & { evaluation_date: string | null; created_at: string })[];
  candidates: (S['CandidateRead'] & { phone: string })[];
  draws: Record<string, S['DrawRead']>;
  exclusions: Record<string, { candidate_id: string; reason: string }[]>;
  chairs: Record<string, string>;
  sheets: Record<string, S['SheetRead'] & { updated_at: string }>;
  documents: (DocumentRead & { started_at: number; corrupt: boolean })[];
  criteria: Record<string, CriteriaRead>;
  pledges: Record<string, string>;
  confirmations: Record<string, { confirmed_by: string; confirmed_at: string }>;
  otp: Record<string, { candidate_id: string; code: string; expires: number }>;
}

const people: [string, string, string][] = [
  ['김가상', '가상대학교', '정보시스템'], ['이예시', '예시연구원', '보안'], ['박샘플', '샘플기술(주)', '데이터·AI'],
  ['최테스트', '테스트대학교', 'SW공학'], ['정모의', '모의연구소', '네트워크'], ['한가정', '가정정보원', '사업관리'],
  ['윤시험', '시험대학교', '정보시스템'], ['오합성', '합성회계법인', '법률·회계'], ['서임시', '임시보안기술', '보안'],
  ['강예제', '예제대학교', '데이터·AI'],
];

const criteriaSpec: [string, string, string, number, string][] = [
  ['c1', '사업 관리', '사업 이해도', 10, '사업의 목적과 범위를 정확히 이해하고 목표에 부합하는 추진 방향을 제시했는지 평가합니다.'],
  ['c2', '사업 관리', '추진 전략', 10, '단계별 추진 일정과 산출물, 위험 관리 계획이 구체적이고 실현 가능한지 평가합니다.'],
  ['c3', '기술', '기술 적용 방안', 20, '클라우드 전환 방안과 아키텍처가 요구사항을 충족하고 기술적으로 타당한지 평가합니다.'],
  ['c4', '기술', '보안 대책', 10, '개인정보·접근통제·취약점 관리 등 보안 요구사항 대응 방안을 평가합니다.'],
  ['c5', '기술', '품질 관리', 10, '시험·검수 절차와 품질 보증 체계가 구체적인지 평가합니다.'],
  ['c6', '관리', '투입 인력', 10, '투입 인력의 역할·경력과 조직 구성이 사업 규모에 적정한지 평가합니다.'],
  ['c7', '지원', '유지보수·교육', 10, '하자보수 기간, 유지보수 체계, 사용자 교육 계획을 평가합니다.'],
];

/** 제안요청서 원문 블록. c6의 근거 블록은 물리 쪽 매핑에 실패한 사례(DOC-02 "쪽 미확인") */
export const rfpBlocks: Block[] = [
  { block_id: 'r-01', physical_page: 1, printed_page: null, heading: '제안요청서', text: '(가상) 정보시스템 구축 사업 제안요청서. 본 문서는 화면 개발용 합성 자료입니다.' },
  { block_id: 'r-02', physical_page: 3, printed_page: '1', heading: '1. 사업 개요', text: '노후 정보시스템을 클라우드 기반으로 전환하고 통합 운영체계를 마련한다. 사업 기간은 계약일로부터 8개월이다.' },
  { block_id: 'r-03', physical_page: 4, printed_page: '2', heading: '2. 추진 일정', text: '착수 후 2주 이내 상세 일정을 확정하고, 분석·설계·구축·시험·이행 단계별 산출물을 제출한다.' },
  { block_id: 'r-04', physical_page: 6, printed_page: '4', heading: '3. 기술 요구사항', text: '클라우드 네이티브 아키텍처를 적용하고 기존 데이터 이관 계획과 무중단 전환 방안을 제시한다.' },
  { block_id: 'r-05', physical_page: 8, printed_page: '6', heading: '4. 보안 요구사항', text: '개인정보 암호화, 역할 기반 접근통제, 정기 취약점 점검 계획을 포함해야 한다.' },
  { block_id: 'r-06', physical_page: 9, printed_page: '7', heading: '5. 품질 요구사항', text: '단위·통합·인수 시험 계획과 결함 관리 절차를 제시한다.' },
  { block_id: 'r-07', physical_page: null, printed_page: null, heading: '6. 투입 인력', text: '사업관리자는 유사 사업 수행 경력 5년 이상이어야 하며, 핵심 인력 교체 시 발주기관 승인을 받는다.' },
  { block_id: 'r-08', physical_page: 11, printed_page: '9', heading: '7. 유지보수·교육', text: '하자보수 기간은 검수 완료일로부터 최소 12개월 이상으로 하고 운영자 교육을 실시한다.' },
  { block_id: 'r-09', physical_page: 13, printed_page: '11', heading: '8. 평가 방법', text: '기술능력평가 80점과 가격평가 20점으로 하며, 협상에 의한 계약 절차를 따른다.' },
];

const proposalText: Record<string, [string, string][]> = {
  'vendor-a': [
    ['사업 이해', '사업 목적을 클라우드 전환과 운영 효율화로 정의하고 현황 진단 결과를 제시했습니다.'],
    ['추진 일정', '단계별 산출물과 주간 진척 보고를 중심으로 8개월 일정을 구성했습니다.'],
    ['아키텍처', '컨테이너 기반 아키텍처와 단계적 데이터 이관 계획을 제시했습니다.'],
    ['보안', '데이터 암호화와 역할 기반 접근통제, 분기별 취약점 점검을 제안했습니다.'],
    ['품질', '시험 단계별 기준과 결함 등급 관리 절차를 제시했습니다.'],
    ['인력', '사업관리자 경력 9년, 핵심 인력 6명 구성을 제시했습니다.'],
    ['유지보수', '하자보수 기간은 검수 완료일로부터 24개월이며 운영자 교육 3회를 제공합니다.'],
  ],
  'vendor-b': [
    ['사업 이해', '사업 배경과 기대효과를 정리하고 개선 목표를 수치로 제시했습니다.'],
    ['추진 일정', '착수 2주 내 상세 일정 확정, 단계별 검토 회의를 제안했습니다.'],
    ['아키텍처', '멀티 클라우드 구성과 무중단 전환 리허설 계획을 제시했습니다.'],
    ['품질', '자동화 시험 도구를 활용한 회귀 시험 계획을 제시했습니다.'],
    ['인력', '사업관리자 경력 12년, 보안 전담 인력 배치를 제시했습니다.'],
    ['유지보수', '하자보수 기간은 검수 완료일로부터 36개월이며 교육은 요청 시 제공합니다.'],
  ],
  'vendor-c': [
    ['사업 이해', '현행 시스템의 문제점을 분석하고 전환 우선순위를 제시했습니다.'],
    ['추진 일정', '분석·설계 단계를 길게 두는 10개 단계 일정을 제시했습니다.'],
    ['아키텍처', '기존 구조를 유지한 채 단계적으로 클라우드로 옮기는 방식을 제안했습니다.'],
    ['보안', '보안 관제 서비스 연계와 접근 기록 보관 방안을 제시했습니다.'],
    ['품질', '외부 품질 감리 대응 계획을 제시했습니다.'],
    ['인력', '사업관리자 경력 6년, 인력 5명 구성을 제시했습니다.'],
    ['유지보수', '하자보수 기간은 검수 완료일로부터 12개월입니다.'],
  ],
};

export function proposalBlocks(vendor: string): Block[] {
  return [{ block_id: `${vendor}-00`, physical_page: 1, printed_page: null, heading: '제안서', text: `${vendorLabel(vendor)} 제안서(합성 자료)` },
    ...proposalText[vendor].map(([heading, text], i) => ({
      block_id: `${vendor}-${String(i + 1).padStart(2, '0')}`, physical_page: 12 + i * 7, printed_page: String(10 + i * 7), heading, text,
    }))];
}

export function vendorLabel(id: string) { return id.replace('vendor-', '').toUpperCase() + '사'; }

/** 기준 → 근거 블록 heading 매칭 키 */
const criterionTopic: Record<string, string> = { c1: '사업 이해', c2: '추진 일정', c3: '아키텍처', c4: '보안', c5: '품질', c6: '인력', c7: '유지보수' };
const criterionRfpBlock: Record<string, string> = { c1: 'r-02', c2: 'r-03', c3: 'r-04', c4: 'r-05', c5: 'r-06', c6: 'r-07', c7: 'r-08' };

export function criteriaDraft(rfpDocId: string): CriterionDraft[] {
  return criteriaSpec.map(([id, area, name, max_score, description]) => {
    const block = rfpBlocks.find(b => b.block_id === criterionRfpBlock[id])!;
    return {
      id, area, name, max_score, description,
      evidence: [{ document_id: rfpDocId, revision: 1, block_id: block.block_id, physical_page: block.physical_page,
        printed_page: block.printed_page, excerpt: block.text }],
      needs_review: block.physical_page === null,
    };
  });
}

export function matches(docIds: Record<string, string>): Match[] {
  return VENDORS.flatMap(vendor => criteriaSpec.map(([criterion_id]) => {
    const block = proposalBlocks(vendor).find(b => b.heading === criterionTopic[criterion_id]);
    return {
      vendor_id: vendor, criterion_id, summary: block ? block.text : null,
      evidence: block ? [{ document_id: docIds[vendor], revision: 1, block_id: block.block_id, physical_page: block.physical_page,
        printed_page: block.printed_page, excerpt: block.text }] : [],
    };
  }));
}

const iso = (offsetMin: number) => new Date(Date.UTC(2026, 9, 12, 1, 0) + offsetMin * 60000).toISOString();

function doc(project_id: string, kind: 'rfp' | 'proposal', vendor_id: string | null, filename: string): Db['documents'][number] {
  const id = `${project_id}-${vendor_id ?? 'rfp'}`;
  return { id, project_id, kind, vendor_id, filename, size: 2_400_000, revision: 1, sha256: `mock-${id}`, uploaded_at: iso(-3000),
    started_at: 0, corrupt: false, job: { id: `job-${id}`, status: 'done', error: null, updated_at: iso(-2990) } };
}

function scoresFor(seed: number) {
  return VENDORS.flatMap((vendor_id, v) => criteriaSpec.map(([criterion_id, , , max], c) =>
    ({ vendor_id, criterion_id, score: Math.max(0, max - ((seed + v * 3 + c) % 4)) })));
}

/** allSubmitted: 시연용 "전원 제출" 시드 (RES-01 이후 화면 확인용) */
export function seed(allSubmitted = false): Db {
  const candidates = people.map(([name, organization, specialty], i) => ({
    id: `cand-${i + 1}`, name, organization, specialty, active: true, phone: `010-0000-${String(i + 1).padStart(4, '0')}`,
  }));
  const p1Criteria = criteriaDraft('p1-rfp').map(c => ({ ...c, needs_review: false }));
  const db: Db = {
    version: SEED_VERSION,
    projects: [
      { id: 'p1', name: '(가상) 정보시스템 구축 사업', department: '정보화사업팀', vendor_ids: VENDORS, evaluation_date: '2026-10-12',
        created_at: iso(-9000), criteria: p1Criteria.map(({ id, name, max_score }) => ({ id, name, max_score })) },
      { id: 'p2', name: '(가상) 민원상담 시스템 고도화', department: '민원혁신팀', vendor_ids: VENDORS, evaluation_date: '2026-10-27',
        created_at: iso(-1000), criteria: [] },
    ],
    candidates,
    draws: {
      p1: { id: 'draw-p1', project_id: 'p1', actor_id: 'local-admin', created_at: iso(-2000), method: 'mock-random',
        selected_ids: ['cand-1', 'cand-2', 'cand-3', 'cand-4', 'cand-5'], reserve_ids: ['cand-6', 'cand-7'],
        candidate_snapshot: candidates.slice(0, 9).map(({ id, name, organization, specialty }) => ({ id, name, organization, specialty })),
        snapshot_sha256: 'mock-3f9a1c' },
    },
    exclusions: { p1: [{ candidate_id: 'cand-10', reason: '제안사 B와 최근 3년 내 용역 수행 이력' }] },
    chairs: { p1: 'cand-1' },
    sheets: {},
    documents: [doc('p1', 'rfp', null, '제안요청서_정보시스템.hwpx'),
      ...VENDORS.map(v => doc('p1', 'proposal', v, `${vendorLabel(v)}_제안서.hwpx`))],
    criteria: {
      p1: { status: 'confirmed', version: 2, technical_total: TECH_TOTAL, items: p1Criteria, source_revision: 1,
        confirmed_by: '이간사', confirmed_at: iso(-2500), locked: true },
    },
    pledges: {},
    confirmations: {},
    otp: {},
  };
  const submitted = allSubmitted ? ['cand-1', 'cand-2', 'cand-3', 'cand-4', 'cand-5'] : ['cand-2', 'cand-3'];
  submitted.forEach((id, i) => {
    db.sheets[`p1:${id}`] = { id: `sheet-p1-${id}`, project_id: 'p1', evaluator_id: id, scores: scoresFor(i + 1),
      opinion: '근거가 구체적인 항목을 중심으로 평가했습니다.', status: 'submitted', submitted_at: iso(30 + i * 7), version: 3, updated_at: iso(30 + i * 7) };
    db.pledges[`p1:${id}`] = iso(-60);
  });
  if (!allSubmitted) {
    db.sheets['p1:cand-4'] = { id: 'sheet-p1-cand-4', project_id: 'p1', evaluator_id: 'cand-4', scores: scoresFor(4).slice(0, 9),
      opinion: '', status: 'draft', submitted_at: null, version: 1, updated_at: iso(20) };
    db.pledges['p1:cand-4'] = iso(-50);
  }
  return db;
}
