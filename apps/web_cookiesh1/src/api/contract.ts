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
}
export interface DocumentUpload { kind: DocKind; vendor_id: string | null; filename: string; size: number }

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

export type Stage = 'preparing' | 'committee' | 'evaluating' | 'collecting_done' | 'confirmed';

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
