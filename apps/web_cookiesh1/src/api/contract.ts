// 제안 계약(DRAFT). apps/api에 아직 없는 경로의 요청·응답 타입입니다.
// 담당자 합의 전이므로 "확정 계약"이 아닙니다. 합의 상태: docs/cookiesh1/UI_DIRECTION.md §5
// 실제 API가 생기면 OpenAPI 생성 타입(schema.d.ts)으로 교체하고 이 파일의 해당 타입을 지웁니다.

export type Role = 'admin' | 'evaluator';

export interface Session {
  token: string;
  role: Role;
  user_id: string;
  name: string;
}

/** POST /api/v1/auth/login */
export interface AdminLogin { username: string; password: string }
/** POST /api/v1/auth/evaluator/otp → 실제 서버는 demo_code를 보내지 않습니다. */
export interface OtpRequest { name: string; phone: string }
export interface OtpIssued { request_id: string; expires_in: number; demo_code?: string }
/** POST /api/v1/auth/evaluator/verify */
export interface OtpVerify { request_id: string; code: string }

/** GET /api/v1/me/assignments — 예비위원은 role 'reserve'로 내려오고 평가표 접근이 거절됩니다. */
export interface Assignment {
  project_id: string;
  project_name: string;
  department: string;
  evaluation_date: string | null;
  role: 'chair' | 'member' | 'reserve';
  sheet_status: 'not_started' | 'draft' | 'submitted';
  criteria_confirmed: boolean;
}

/** GET·POST /api/v1/projects/{id}/pledge/me */
export interface Pledge { agreed_at: string | null }

/** 원문 근거. 물리 쪽을 모르면 physical_page = null → 화면은 "쪽 미확인". (DOC-02) */
export interface Evidence {
  document_id: string;
  revision: number;
  block_id: string;
  physical_page: number | null;
  printed_page: string | null;
  excerpt: string;
}

export type DocKind = 'rfp' | 'proposal';
export type JobStatus = 'queued' | 'parsing' | 'done' | 'failed';

/** GET /api/v1/projects/{id}/documents, POST (업로드: 실제는 multipart) */
export interface DocumentRead {
  id: string;
  project_id: string;
  kind: DocKind;
  vendor_id: string | null;
  filename: string;
  size: number;
  revision: number;
  sha256: string;
  uploaded_at: string;
  job: { id: string; status: JobStatus; error: string | null; updated_at: string };
  parse?: { pages: number; blocks: number; warnings: number };
}
export interface DocumentUpload { kind: DocKind; vendor_id: string | null; filename: string; size: number }

export interface RequirementBlock {
  id: string;
  type: 'paragraph' | 'table';
  pages: number[];
  text?: string;
  rows?: { text: string; row_span: number; col_span: number }[][];
}
export interface RequirementsRead {
  status: 'none' | 'queued' | 'running' | 'done' | 'failed';
  revision: number | null;
  error: string | null;
  result: {
    status: 'complete' | 'needs_review';
    created_at: string;
    warnings: string[];
    business_status: Record<'current_status' | 'background_and_need' | 'scope', { text: string; pages: number[] }[]>;
    requirement_list: RequirementBlock[];
    details: { label: string; codes: string[]; pages: number[]; blocks: RequirementBlock[] }[];
  } | null;
}

export interface SqliteCriteriaRead {
  status: 'none' | 'queued' | 'running' | 'done' | 'failed';
  revision: number | null;
  requirements_ready: boolean;
  error: string | null;
  result: {
    created_at: string;
    template_source: 'request_document' | 'generated_from_summary';
    reference_filename: string;
    total_score: number;
    rows: {
      row_id: string;
      evaluation_division: string;
      division_score: number;
      evaluation_item: string;
      evaluation_criteria: string;
      evaluation_elements: string[];
      score: number;
    }[];
    selection_rationale: {
      current_status: string;
      background_and_need: string;
      scope: string;
      evaluation_links: { evaluation_division: string; reason: string }[];
    };
    supplemental_items: {
      guideline_area: string;
      evaluation_item: string;
      evaluation_criteria: string;
      evaluation_elements: string[];
      source_id: string;
      source_quote: string;
    }[];
    guideline_url: string;
  } | null;
}

export interface Block { block_id: string; physical_page: number | null; printed_page: string | null; heading: string | null; text: string }
/** GET /api/v1/projects/{id}/documents/{doc_id} — 원문 블록 */
export interface DocumentContent { document: DocumentRead; label: string; blocks: Block[] }

export interface CriterionDraft {
  id: string;
  area: string;
  name: string;
  max_score: number;
  description: string;
  evidence: Evidence[];
  needs_review: boolean;
}
/** GET /api/v1/projects/{id}/criteria */
export interface CriteriaRead {
  status: 'none' | 'draft' | 'confirmed';
  version: number;
  technical_total: number;
  items: CriterionDraft[];
  source_revision: number | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  locked: boolean;
}
/** POST /api/v1/projects/{id}/criteria/confirm */
export interface CriteriaConfirm {
  expected_version: number;
  items: Pick<CriterionDraft, 'id' | 'area' | 'name' | 'max_score' | 'description'>[];
}

/** GET /api/v1/projects/{id}/matches — 평가기준별 제안서 근거 */
export interface Match { vendor_id: string; criterion_id: string; summary: string | null; evidence: Evidence[] }

/** POST /api/v1/projects/{id}/ask */
export interface AskRequest { question: string; scope: 'all' | 'rfp' | string }
export interface Citation extends Evidence { label: string }
export interface AskAnswer { status: 'answered' | 'no_evidence' | 'conflict' | 'refused'; answer: string; citations: Citation[] }

/** POST /api/v1/projects/{id}/committee/draw 확장 — 제척 사유 기록 (Lex6won 합의 필요) */
export interface DrawExclusion { candidate_id: string; reason: string }
/** PUT /api/v1/projects/{id}/committee/chair */
export interface ChairSet { evaluator_id: string }

export type Stage = 'preparing' | 'committee' | 'evaluating' | 'collecting_done' | 'confirmed' | 'closed';

/** GET /api/v1/projects/{id}/progress */
export interface ProgressRead {
  stage: Stage;
  evaluation_date: string | null;
  chair_id: string | null;
  presentation_order: string[];
  members: {
    evaluator_id: string;
    name: string;
    organization: string;
    specialty: string;
    role: 'chair' | 'member' | 'reserve';
    sheet_status: 'not_started' | 'draft' | 'submitted';
    last_saved_at: string | null;
    submitted_at: string | null;
  }[];
}

/** GET /api/v1/projects/{id}/results/detail — 기존 /results를 보완하는 위원별 합계 (u-jing 합의 필요) */
export interface ResultsDetail {
  members: { evaluator_id: string; name: string; totals: Record<string, number>; submitted_at: string }[];
  confirmation: { confirmed_by: string; confirmed_at: string } | null;
}
/** POST /api/v1/projects/{id}/results/confirm — 위원장 확인 기록(전자서명 아님) */
export interface ResultsConfirm { attested: true }

/* ── 관리자 7단계 보강 (2026-10-12 제안, 담당 합의 전 mock 가정) ── */

/** GET·PUT /api/v1/projects/{id}/vendors — 제안사 등록. 실제 업체명은 관리자만 조회(평가위원은 A·B·C 코드만). (DaeUng79·u-jing 합의 필요) */
export interface VendorRead { vendor_id: string; code: string; name: string; registered_at: string }
/** PUT 본문: 순서대로 A·B·C… 코드 부여. vendor_id가 있으면 이름만 변경. 평가 시작 후 409 */
export interface VendorsSet { vendors: { vendor_id?: string; name: string }[] }

/** GET·PUT /api/v1/projects/{id}/schedule — 평가 일정·발표 순서·참석 (PROG-01, Lex6won·u-jing 합의 필요) */
export type Attendance = 'present' | 'absent' | 'unknown';
export interface ScheduleRead {
  evaluation_date: string | null;
  presentation_order: string[];
  presentation_minutes: number;
  qa_minutes: number;
  attendance: { evaluator_id: string; status: Attendance }[];
}
/** PUT 본문: 보낸 필드만 변경. 발표 순서는 등록된 제안사의 순열이어야 함(422) */
export interface ScheduleSet {
  evaluation_date?: string | null;
  presentation_order?: string[];
  presentation_minutes?: number;
  qa_minutes?: number;
  attendance?: { evaluator_id: string; status: Attendance }[];
}

/** POST /api/v1/projects/{id}/close — 사업 완료 처리(CLOSE-01, u-jing 합의 필요). 위원장 확인 전 409, 완료 후 문서·기준·위원·평가 변경 409 */
export interface ProjectClose { attested: true }
/** GET /api/v1/projects/{id}/close */
export interface ProjectClosed { closed_at: string | null; closed_by: string | null }
