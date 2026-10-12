// mock API (VITE_USE_MOCK=1 전용). 실제 서버 없이 화면 상태를 재현합니다.
// - 데이터는 localStorage에 남고 요청마다 다시 읽습니다(새로고침 유지, 두 탭 충돌 재현). 시연 도구로 초기화합니다.
// - 아래 규칙 중 "mock 가정"은 담당자와 합의되지 않은 임시 규칙입니다. mock 성공 ≠ 실제 서버 통합 성공.
import type { components } from './schema';
import type {
  AskAnswer, Assignment, Citation, CriteriaConfirm, CriteriaRead, DocumentContent, DocumentRead, DocumentUpload,
  ProgressRead, ProjectClose, ProjectClosed, ResultsDetail, ScheduleRead, ScheduleSet, Session, Stage, VendorRead, VendorsSet,
} from './contract';
import { getFlags } from './demo';
import { type Db, SEED_VERSION, TECH_TOTAL, criteriaDraft, defaultSchedule, matches, proposalBlocks, rfpBlocks, seed, vendorLabel } from './mockSeed';

type S = components['schemas'];
const DB_KEY = 'simsa-mock-db';
const MAX_UPLOAD = 50 * 1024 * 1024;

function load(): Db {
  try {
    const db = JSON.parse(localStorage.getItem(DB_KEY) ?? 'null') as Db | null;
    if (db?.version === SEED_VERSION) return db;
  } catch { /* 손상된 저장값은 시드로 대체 */ }
  return save(seed());
}
function save(db: Db) { localStorage.setItem(DB_KEY, JSON.stringify(db)); return db; }
export function resetDb(allSubmitted = false) { save(seed(allSubmitted)); }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fail = (status: number, detail: string) => json({ detail }, status);
const now = () => new Date().toISOString();

type Who = { role: 'admin' } | { role: 'evaluator'; id: string } | null;
function whoOf(req: Request): Who {
  const auth = req.headers.get('Authorization') ?? '';
  if (auth === 'Bearer local-admin') return { role: 'admin' };
  const id = auth.match(/^Bearer local-evaluator:(.+)$/)?.[1];
  return id ? { role: 'evaluator', id } : null;
}

const selected = (db: Db, pid: string) => db.draws[pid]?.selected_ids ?? [];
const isMember = (db: Db, pid: string, id: string) => selected(db, pid).includes(id);
const submittedSheets = (db: Db, pid: string) => selected(db, pid).map(id => db.sheets[`${pid}:${id}`]).filter(s => s?.status === 'submitted');
const allSubmitted = (db: Db, pid: string) => selected(db, pid).length > 0 && submittedSheets(db, pid).length === selected(db, pid).length;
const candidateName = (db: Db, id: string) => db.candidates.find(c => c.id === id)?.name ?? id;
const criteriaLocked = (db: Db, pid: string) => Object.keys(db.sheets).some(k => k.startsWith(`${pid}:`));

/** 파싱 작업 진행을 시간 경과로 흉내 냅니다. */
function advanceJobs(db: Db) {
  let changed = false;
  for (const d of db.documents) {
    if (d.job.status === 'done' || d.job.status === 'failed') continue;
    const elapsed = Date.now() - d.started_at;
    const next = elapsed < 1500 ? 'queued' : elapsed < 4500 ? 'parsing' : d.corrupt ? 'failed' : 'done';
    if (next === d.job.status) continue;
    d.job = { ...d.job, status: next, updated_at: now(), error: next === 'failed' ? '문서 구조를 읽을 수 없습니다. 손상되었거나 HWPX 형식이 아닙니다.' : null };
    changed = true;
    if (next === 'done' && d.kind === 'rfp') {
      const prev = db.criteria[d.project_id];
      db.criteria[d.project_id] = { status: 'draft', version: (prev?.version ?? 0) + 1, technical_total: TECH_TOTAL,
        items: criteriaDraft(d.id).map(c => ({ ...c, evidence: c.evidence.map(e => ({ ...e, revision: d.revision })) })),
        source_revision: d.revision, confirmed_by: null, confirmed_at: null, locked: false };
      const project = db.projects.find(p => p.id === d.project_id)!;
      project.criteria = [];
    }
  }
  return changed;
}

function results(db: Db, pid: string): S['ResultsRead'] {
  const expected = selected(db, pid).length;
  const submitted = submittedSheets(db, pid);
  const complete = allSubmitted(db, pid);
  const vendors = db.projects.find(p => p.id === pid)?.vendor_ids ?? [];
  return {
    expected, submitted: submitted.length, status: complete ? 'technical_complete' : 'collecting',
    calculation: '제안사별 (위원 기술점수 합계)의 단순 평균 — mock 가정, 산식 정책 미확정(RES-02)',
    averages: complete ? vendors.map(vendor_id => ({
      vendor_id,
      technical_average: submitted.reduce((sum, s) => sum + s.scores.filter(x => x.vendor_id === vendor_id).reduce((a, x) => a + x.score, 0), 0) / submitted.length,
    })) : [],
  };
}

const CLOSED_MSG = '완료된 사업은 바꿀 수 없어요';
const MAX_VENDORS = 5;
const ADMIN_NAME = '이간사';
const isClosed = (db: Db, pid: string) => !!db.closes[pid];
const evaluationStarted = (db: Db, pid: string) => criteriaLocked(db, pid) || !['preparing', 'committee'].includes(stageOf(db, pid));
const vendorsOf = (db: Db, pid: string) => db.vendors[pid] ?? [];
const validDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
/** 발표 순서는 등록 업체와 항상 일치: 삭제된 업체 제거, 새 업체는 뒤에 붙임 */
function scheduleOf(db: Db, pid: string) {
  const sc = db.schedules[pid] ?? (db.schedules[pid] = defaultSchedule());
  const ids = vendorsOf(db, pid).map(v => v.vendor_id);
  sc.presentation_order = [...sc.presentation_order.filter(id => ids.includes(id)), ...ids.filter(id => !sc.presentation_order.includes(id))];
  return sc;
}
function scheduleRead(db: Db, pid: string): ScheduleRead {
  const sc = scheduleOf(db, pid);
  const draw = db.draws[pid];
  return { evaluation_date: db.projects.find(p => p.id === pid)?.evaluation_date ?? null, presentation_order: sc.presentation_order,
    presentation_minutes: sc.presentation_minutes, qa_minutes: sc.qa_minutes,
    attendance: draw ? [...draw.selected_ids, ...draw.reserve_ids].map(evaluator_id => ({ evaluator_id, status: sc.attendance[evaluator_id] ?? 'unknown' })) : [] };
}

function stageOf(db: Db, pid: string): Stage {
  if (db.closes[pid]) return 'closed';
  if (db.confirmations[pid]) return 'confirmed';
  if (allSubmitted(db, pid)) return 'collecting_done';
  if (db.draws[pid] && db.criteria[pid]?.status === 'confirmed') return 'evaluating';
  if (db.criteria[pid]?.status === 'confirmed') return 'committee';
  return 'preparing';
}

function validateScores(project: S['ProjectRead'], scores: S['ScoreEntry'][]) {
  const seen = new Set<string>();
  for (const s of scores) {
    const c = project.criteria.find(x => x.id === s.criterion_id);
    if (!c || !project.vendor_ids.includes(s.vendor_id)) return '존재하지 않는 평가항목 또는 제안사가 포함되어 있습니다.';
    const key = `${s.vendor_id}:${s.criterion_id}`;
    if (seen.has(key)) return '같은 항목이 중복되어 있습니다.';
    seen.add(key);
    if (typeof s.score !== 'number' || !Number.isFinite(s.score) || s.score < 0 || s.score > c.max_score)
      return `${vendorLabel(s.vendor_id)} '${c.name}' 점수는 0~${c.max_score}점이어야 합니다.`;
    if (Math.round(s.score * 100) !== s.score * 100) return '점수는 소수점 둘째 자리까지 입력할 수 있습니다.';
  }
  return null;
}

function ask(db: Db, pid: string, question: string, scope: string): AskAnswer {
  if (/(점수|평가).*(저장|입력|제출|매겨|대신)/.test(question) || /(제출|확정)해\s*줘/.test(question))
    return { status: 'refused', answer: '챗봇은 점수를 입력·저장·제출할 수 없어요. 평가는 평가하기 화면에서 직접 해 주세요.', citations: [] };
  const other = db.projects.find(p => p.id !== pid && question.includes(p.name.replace('(가상) ', '').slice(0, 4)));
  if (other) return { status: 'refused', answer: '다른 사업의 문서는 검색할 수 없어요. 이 사업의 문서 안에서만 답합니다.', citations: [] };
  const docs = db.documents.filter(d => d.project_id === pid && d.job.status === 'done'
    && (scope === 'all' || (scope === 'rfp' ? d.kind === 'rfp' : d.vendor_id === scope)));
  const words = question.replace(/[?.!,]/g, ' ').split(/\s+/).map(w => w.replace(/(은|는|이|가|을|를|에|의|와|과|도|로|으로|에서|인가요|나요|까요|있나요|어떻게|되나요)$/, '')).filter(w => w.length >= 2);
  const hits: (Citation & { score: number })[] = [];
  for (const d of docs) {
    const blocks = d.kind === 'rfp' ? rfpBlocks : proposalBlocks(d.vendor_id!);
    const label = d.kind === 'rfp' ? '제안요청서' : `${vendorLabel(d.vendor_id!)} 제안서`;
    for (const b of blocks) {
      const score = words.filter(w => b.text.includes(w) || b.heading?.includes(w)).length;
      if (score) hits.push({ score, label, document_id: d.id, revision: d.revision, block_id: b.block_id, physical_page: b.physical_page, printed_page: b.printed_page, excerpt: b.text });
    }
  }
  const best = Math.max(0, ...hits.map(h => h.score));
  const citations: Citation[] = hits.filter(h => h.score === best).map(({ score: _s, ...c }) => c);
  if (!citations.length) return { status: 'no_evidence', answer: '문서에서 관련 내용을 찾지 못했어요. 원문을 직접 확인해 주세요.', citations: [] };
  const top = citations.slice(0, 5);
  return { status: 'answered', answer: top.map(c => `${c.label}: ${c.excerpt}`).join('\n'), citations: top };
}

async function handle(req: Request): Promise<Response> {
  const flags = getFlags();
  if (flags.serverError) return fail(500, '서버 내부 오류 (시연 도구: 서버 오류)');
  const { pathname } = new URL(req.url);
  const method = req.method;
  const body = method === 'GET' ? undefined : await req.json().catch(() => undefined);
  const db = load();
  if (advanceJobs(db)) save(db);

  if (pathname === '/api/v1/health') return json({ status: 'ok', demo_auth: true });
  if (pathname === '/api/v1/ai/status') return json({ status: 'not_connected', detail: 'mock 모드' });

  // ── 인증 (제안 계약) ──
  if (pathname === '/api/v1/auth/login' && method === 'POST') {
    if (body?.username !== 'gansa' || body?.password !== 'demo') return fail(401, '아이디 또는 비밀번호가 맞지 않습니다.');
    return json({ token: 'local-admin', role: 'admin', user_id: 'admin-1', name: '이간사' } satisfies Session);
  }
  if (pathname === '/api/v1/auth/evaluator/otp' && method === 'POST') {
    const digits = String(body?.phone ?? '').replace(/\D/g, '');
    const c = db.candidates.find(x => x.name === String(body?.name ?? '').trim() && x.phone.replace(/\D/g, '') === digits);
    if (!c) return fail(404, '간사가 등록한 평가위원 정보와 일치하지 않습니다. 이름과 휴대폰 번호를 확인해 주세요.');
    const request_id = `otp-${Date.now()}`;
    const code = String(100000 + Math.floor(Math.random() * 900000));
    db.otp[request_id] = { candidate_id: c.id, code, expires: Date.now() + 180_000 };
    save(db);
    return json({ request_id, expires_in: 180, demo_code: code });
  }
  if (pathname === '/api/v1/auth/evaluator/verify' && method === 'POST') {
    const o = db.otp[body?.request_id];
    if (!o || o.expires < Date.now()) return fail(422, '인증번호가 만료되었습니다. 다시 받아 주세요.');
    if (o.code !== body?.code) return fail(422, '인증번호가 맞지 않습니다.');
    delete db.otp[body.request_id]; save(db);
    return json({ token: `local-evaluator:${o.candidate_id}`, role: 'evaluator', user_id: o.candidate_id, name: candidateName(db, o.candidate_id) } satisfies Session);
  }

  const who = whoOf(req);
  if (!who) return fail(401, '로그인이 필요합니다.');
  const isAdmin = who.role === 'admin';
  const me = who.role === 'evaluator' ? who.id : '';
  const empty = flags.empty && method === 'GET';

  if (pathname === '/api/v1/me/assignments') {
    if (isAdmin) return fail(403, '평가위원 전용 화면입니다.');
    if (empty) return json([]);
    const list: Assignment[] = db.projects.flatMap(p => {
      const draw = db.draws[p.id];
      const role = !draw ? null : draw.selected_ids.includes(me) ? (db.chairs[p.id] === me ? 'chair' : 'member') : draw.reserve_ids.includes(me) ? 'reserve' : null;
      if (!role) return [];
      const sheet = db.sheets[`${p.id}:${me}`];
      return [{ project_id: p.id, project_name: p.name, department: p.department, evaluation_date: p.evaluation_date, role,
        sheet_status: sheet ? sheet.status : 'not_started', criteria_confirmed: db.criteria[p.id]?.status === 'confirmed' }];
    });
    return json(list);
  }

  if (pathname === '/api/v1/projects') {
    if (method === 'GET') {
      if (empty) return json([]);
      return json(isAdmin ? db.projects : db.projects.filter(p => isMember(db, p.id, me)));
    }
    if (!isAdmin) return fail(403, '관리자만 사업을 등록할 수 있습니다.');
    const name = String(body?.name ?? '').trim(), department = String(body?.department ?? '').trim();
    if (!name || !department) return fail(422, '사업명과 담당 부서를 입력해 주세요.');
    const rawDate = body?.evaluation_date ?? null;
    if (rawDate !== null && !validDate(rawDate)) return fail(422, '평가일은 YYYY-MM-DD 형식이어야 합니다.');
    const created = { id: `p${db.projects.length + 1}-${Date.now() % 10000}`, name, department, criteria: [], vendor_ids: [] as string[],
      evaluation_date: rawDate as string | null, created_at: now() };
    db.projects.push(created); db.vendors[created.id] = []; db.schedules[created.id] = defaultSchedule(); save(db);
    return json(created, 201);
  }
  if (pathname === '/api/v1/committee/candidates') {
    if (!isAdmin) return fail(403, '관리자만 평가위원 후보를 볼 수 있습니다.');
    if (method === 'GET') return json(empty ? [] : db.candidates.map(({ phone: _phone, ...c }) => c));
    const name = String(body?.name ?? '').trim(), organization = String(body?.organization ?? '').trim(), specialty = String(body?.specialty ?? '').trim();
    if (!name || !organization || !specialty) return fail(422, '이름·소속·전문분야를 모두 입력해 주세요.');
    if (db.candidates.some(c => c.name === name && c.organization === organization)) return fail(409, `이미 등록된 후보입니다: ${name} (${organization})`);
    const created = { id: `cand-${db.candidates.length + 1}`, name, organization, specialty, active: true, phone: `010-0000-${String(db.candidates.length + 1).padStart(4, '0')}` };
    db.candidates.push(created); save(db);
    const { phone: _phone, ...publicCandidate } = created;
    return json(publicCandidate, 201);
  }

  const m = pathname.match(/^\/api\/v1\/projects\/([^/]+)(\/.*)?$/);
  const pid = m?.[1] ?? '';
  const sub = m?.[2] ?? '';
  const project = db.projects.find(p => p.id === pid);
  if (!project) return fail(404, '사업을 찾을 수 없습니다.');
  const member = !isAdmin && isMember(db, pid, me);
  const chair = !isAdmin && db.chairs[pid] === me && member;

  if (sub === '/progress') {
    if (!isAdmin) return fail(403, '진행 현황은 관리자만 볼 수 있습니다.');
    const draw = db.draws[pid];
    const members: ProgressRead['members'] = draw ? [...draw.selected_ids, ...draw.reserve_ids].map(id => {
      const c = db.candidates.find(x => x.id === id)!;
      const sheet = db.sheets[`${pid}:${id}`];
      return { evaluator_id: id, name: c.name, organization: c.organization, specialty: c.specialty,
        role: draw.reserve_ids.includes(id) ? 'reserve' : db.chairs[pid] === id ? 'chair' : 'member',
        sheet_status: sheet ? sheet.status : 'not_started', last_saved_at: sheet?.updated_at ?? null, submitted_at: sheet?.submitted_at ?? null };
    }) : [];
    return json({ stage: stageOf(db, pid), evaluation_date: project.evaluation_date, chair_id: db.chairs[pid] ?? null,
      presentation_order: scheduleOf(db, pid).presentation_order, members } satisfies ProgressRead);
  }

  if (sub === '/vendors') {
    if (!isAdmin) return fail(403, '제안사 정보는 관리자만 볼 수 있습니다.');
    if (method === 'GET') return json(empty ? [] : vendorsOf(db, pid) satisfies VendorRead[]);
    if (method !== 'PUT') return fail(405, '지원하지 않는 메서드입니다.');
    if (isClosed(db, pid)) return fail(409, CLOSED_MSG);
    if (evaluationStarted(db, pid)) return fail(409, '평가가 시작되어 제안사를 바꿀 수 없어요. (mock 가정)');
    const list = (body as VendorsSet | undefined)?.vendors;
    if (!Array.isArray(list)) return fail(422, '제안사 목록이 필요해요.');
    if (list.length > MAX_VENDORS) return fail(422, '제안사는 5곳까지 등록할 수 있어요(mock 가정)');
    const current = vendorsOf(db, pid);
    const names = list.map(v => String(v?.name ?? '').trim());
    if (names.some(n => !n)) return fail(422, '제안사 이름을 입력해 주세요.');
    if (new Set(names.map(n => n.toLowerCase())).size !== names.length) return fail(422, '같은 이름의 제안사가 있어요.');
    const given = list.map(v => v.vendor_id).filter((x): x is string => !!x);
    if (given.some(id => !current.some(v => v.vendor_id === id)) || new Set(given).size !== given.length) return fail(422, '등록되지 않은 제안사 번호가 있어요.');
    const removed = current.filter(v => !given.includes(v.vendor_id));
    if (removed.some(v => db.documents.some(d => d.project_id === pid && d.kind === 'proposal' && d.vendor_id === v.vendor_id)))
      return fail(409, '제안서가 올라간 업체는 삭제할 수 없어요');
    const free = ['a', 'b', 'c', 'd', 'e'].map(l => `vendor-${l}`).filter(id => !given.includes(id));
    const next: VendorRead[] = list.map((v, i) => {
      const prev = current.find(x => x.vendor_id === v.vendor_id);
      return { vendor_id: prev?.vendor_id ?? free.shift()!, code: String.fromCharCode(65 + i), name: names[i], registered_at: prev?.registered_at ?? now() };
    });
    db.vendors[pid] = next;
    project.vendor_ids = next.map(v => v.vendor_id);
    scheduleOf(db, pid);
    save(db);
    return json(next);
  }

  if (sub === '/schedule') {
    if (!isAdmin) return fail(403, '평가 일정은 관리자만 볼 수 있습니다.');
    if (method === 'GET') return json(scheduleRead(db, pid));
    if (method !== 'PUT') return fail(405, '지원하지 않는 메서드입니다.');
    if (isClosed(db, pid)) return fail(409, CLOSED_MSG);
    const input = (body ?? {}) as ScheduleSet;
    const sc = scheduleOf(db, pid);
    if (input.evaluation_date !== undefined && input.evaluation_date !== null && !validDate(input.evaluation_date)) return fail(422, '평가일은 YYYY-MM-DD 형식이어야 합니다.');
    for (const k of ['presentation_minutes', 'qa_minutes'] as const) {
      const v = input[k];
      if (v !== undefined && (!Number.isInteger(v) || v < 1 || v > 120)) return fail(422, '시간은 1~120분 사이여야 합니다.');
    }
    if (input.presentation_order !== undefined) {
      const ids = vendorsOf(db, pid).map(v => v.vendor_id), o = input.presentation_order;
      if (!Array.isArray(o) || o.length !== ids.length || new Set(o).size !== o.length || o.some(id => !ids.includes(id)))
        return fail(422, '발표 순서는 등록된 제안사를 한 번씩 모두 포함해야 해요.');
    }
    if (input.attendance !== undefined) {
      const drawn = [...(db.draws[pid]?.selected_ids ?? []), ...(db.draws[pid]?.reserve_ids ?? [])];
      if (!Array.isArray(input.attendance) || input.attendance.some(a => !drawn.includes(a?.evaluator_id) || !['present', 'absent', 'unknown'].includes(a.status)))
        return fail(422, '추첨된 평가위원의 참석 상태만 바꿀 수 있어요.');
    }
    if (input.evaluation_date !== undefined) project.evaluation_date = input.evaluation_date;
    if (input.presentation_order !== undefined) sc.presentation_order = [...input.presentation_order];
    if (input.presentation_minutes !== undefined) sc.presentation_minutes = input.presentation_minutes;
    if (input.qa_minutes !== undefined) sc.qa_minutes = input.qa_minutes;
    input.attendance?.forEach(a => { sc.attendance[a.evaluator_id] = a.status; });
    save(db);
    return json(scheduleRead(db, pid));
  }

  if (sub === '/close') {
    if (!isAdmin) return fail(403, '사업 완료는 관리자만 할 수 있어요.');
    const c = db.closes[pid];
    if (method === 'GET') return json({ closed_at: c?.closed_at ?? null, closed_by: c?.closed_by ?? null } satisfies ProjectClosed);
    if (method !== 'POST') return fail(405, '지원하지 않는 메서드입니다.');
    if (c) return fail(409, '이미 완료된 사업이에요');
    if (!db.confirmations[pid]) return fail(409, '위원장 확인 후 완료할 수 있어요');
    if ((body as ProjectClose | undefined)?.attested !== true) return fail(422, '완료 내용에 동의해 주세요.');
    db.closes[pid] = { closed_at: now(), closed_by: ADMIN_NAME }; save(db);
    return json({ closed_at: db.closes[pid].closed_at, closed_by: ADMIN_NAME } satisfies ProjectClosed);
  }

  if (sub === '/committee/draw') {
    if (!isAdmin) return fail(403, '관리자만 추첨 정보를 볼 수 있습니다.');
    if (method === 'GET') return json(db.draws[pid] ?? null);
    if (isClosed(db, pid)) return fail(409, CLOSED_MSG);
    if (db.draws[pid]) return fail(409, '이미 추첨이 확정되었습니다. 재선정은 합의된 절차가 필요합니다.');
    const { candidate_ids = [], seats = 0, reserves = 0, exclusions = [] } = (body ?? {}) as S['DrawCreate'] & { exclusions?: Db['exclusions'][string] };
    if (seats < 1 || reserves < 0) return fail(422, '본위원은 1명 이상, 예비위원은 0명 이상이어야 합니다.');
    if (exclusions.some(e => !e.reason?.trim())) return fail(422, '제척 사유를 입력해 주세요.');
    const excluded = new Set(exclusions.map(e => e.candidate_id));
    const pool = [...new Set(candidate_ids as string[])].filter(id => !excluded.has(id) && db.candidates.some(c => c.id === id && c.active));
    if (pool.length < seats + reserves) return fail(422, `후보가 부족합니다. 필요 ${seats + reserves}명, 추첨 가능 ${pool.length}명`);
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const draw: S['DrawRead'] = {
      id: `draw-${pid}`, project_id: pid, actor_id: 'local-admin', created_at: now(), method: 'mock-random',
      selected_ids: shuffled.slice(0, seats), reserve_ids: shuffled.slice(seats, seats + reserves),
      candidate_snapshot: db.candidates.filter(c => pool.includes(c.id)).map(({ id, name, organization, specialty }) => ({ id, name, organization, specialty })),
      snapshot_sha256: `mock-${Math.random().toString(16).slice(2, 10)}`,
    };
    db.draws[pid] = draw; db.exclusions[pid] = exclusions; save(db);
    return json(draw, 201);
  }
  if (sub === '/committee/exclusions' && method === 'GET') {
    if (!isAdmin) return fail(403, '관리자 전용입니다.');
    return json(db.exclusions[pid] ?? []);
  }
  if (sub === '/committee/chair' && method === 'PUT') {
    if (!isAdmin) return fail(403, '관리자만 위원장을 지정할 수 있습니다.');
    if (isClosed(db, pid)) return fail(409, CLOSED_MSG);
    if (!isMember(db, pid, body?.evaluator_id)) return fail(422, '위원장은 본위원 중에서만 지정할 수 있습니다.');
    if (db.confirmations[pid]) return fail(409, '결과가 확인된 뒤에는 위원장을 바꿀 수 없습니다.');
    db.chairs[pid] = body.evaluator_id; save(db);
    return json({ chair_id: body.evaluator_id });
  }

  if (sub === '/pledge/me') {
    if (!member) return fail(403, '이 사업에 배정된 본위원만 서약할 수 있습니다.');
    if (method === 'POST') { db.pledges[`${pid}:${me}`] = db.pledges[`${pid}:${me}`] ?? now(); save(db); }
    return json({ agreed_at: db.pledges[`${pid}:${me}`] ?? null });
  }

  if (sub === '/documents') {
    if (!isAdmin && !member) return fail(403, '이 사업의 문서를 볼 권한이 없습니다.');
    if (method === 'GET') return json(empty ? [] : db.documents.filter(d => d.project_id === pid).map(({ started_at: _s, corrupt: _c, ...d }) => d));
    if (!isAdmin) return fail(403, '관리자만 문서를 올릴 수 있습니다.');
    if (isClosed(db, pid)) return fail(409, CLOSED_MSG);
    const up = body as DocumentUpload;
    if (!/\.hwpx$/i.test(up.filename ?? '')) return fail(422, '지원하지 않는 형식입니다. 현재는 HWPX 파일만 처리할 수 있습니다.');
    if (up.size > MAX_UPLOAD) return fail(422, '파일이 너무 큽니다. 50MB 이하로 올려 주세요.');
    if (up.size === 0) return fail(422, '빈 파일입니다.');
    if (up.kind === 'proposal' && !project.vendor_ids.includes(up.vendor_id ?? '')) return fail(422, up.vendor_id ? '등록되지 않은 제안사의 제안서는 올릴 수 없어요.' : '제안사를 선택해 주세요.');
    if (up.kind === 'rfp' && criteriaLocked(db, pid)) return fail(409, '평가가 시작되어 제안요청서를 교체할 수 없습니다. (변경 규칙 담당자 합의 필요)');
    const prev = db.documents.filter(d => d.project_id === pid && d.kind === up.kind && d.vendor_id === (up.vendor_id ?? null));
    const id = `${pid}-${up.vendor_id ?? 'rfp'}-r${prev.length + 1}`;
    db.documents = db.documents.filter(d => !prev.includes(d));
    const created = { id, project_id: pid, kind: up.kind, vendor_id: up.vendor_id ?? null, filename: up.filename, size: up.size,
      revision: (prev.at(-1)?.revision ?? 0) + 1, sha256: `mock-${Math.random().toString(16).slice(2, 10)}`, uploaded_at: now(),
      started_at: Date.now(), corrupt: up.filename.includes('손상'), job: { id: `job-${id}`, status: 'queued' as const, error: null, updated_at: now() } };
    db.documents.push(created); save(db);
    const { started_at: _s, corrupt: _c, ...publicDoc } = created;
    return json(publicDoc satisfies DocumentRead, 201);
  }
  const docMatch = sub.match(/^\/documents\/([^/]+)$/);
  if (docMatch) {
    if (!isAdmin && !member) return fail(403, '이 사업의 문서를 볼 권한이 없습니다.');
    const d = db.documents.find(x => x.id === docMatch[1] && x.project_id === pid);
    if (!d) return fail(404, '문서를 찾을 수 없습니다.');
    if (d.job.status !== 'done') return fail(409, '문서 처리가 끝나지 않았습니다.');
    const { started_at: _s, corrupt: _c, ...document } = d;
    return json({ document, label: d.kind === 'rfp' ? '제안요청서' : `${vendorLabel(d.vendor_id!)} 제안서`,
      blocks: d.kind === 'rfp' ? rfpBlocks : proposalBlocks(d.vendor_id!) } satisfies DocumentContent);
  }

  if (sub === '/criteria') {
    const c: CriteriaRead = db.criteria[pid]
      ?? { status: 'none', version: 0, technical_total: TECH_TOTAL, items: [], source_revision: null, confirmed_by: null, confirmed_at: null, locked: false };
    if (!isAdmin && (!member || c.status !== 'confirmed')) return member ? json({ ...c, status: 'none', items: [] }) : fail(403, '권한이 없습니다.');
    return json({ ...c, locked: c.status === 'confirmed' && criteriaLocked(db, pid) });
  }
  if (sub === '/criteria/confirm' && method === 'POST') {
    if (!isAdmin) return fail(403, '관리자만 평가기준을 확정할 수 있습니다.');
    const c = db.criteria[pid];
    const input = body as CriteriaConfirm;
    if (isClosed(db, pid)) return fail(409, CLOSED_MSG);
    if (!c) return fail(409, '제안요청서 처리 후 확정할 수 있습니다.');
    if (criteriaLocked(db, pid)) return fail(409, '평가가 시작되어 평가기준을 바꿀 수 없습니다. (mock 가정 · 담당자 합의 필요)');
    if (input.expected_version !== c.version) return fail(409, '다른 곳에서 평가기준이 바뀌었습니다. 다시 불러와 주세요.');
    if (input.items.some(i => !i.name.trim() || !(i.max_score > 0))) return fail(422, '항목명과 0보다 큰 배점을 입력해 주세요.');
    const total = input.items.reduce((a, i) => a + i.max_score, 0);
    if (total !== c.technical_total) return fail(422, `배점 합계가 ${total}점입니다. 기술평가 ${c.technical_total}점과 같아야 합니다.`);
    db.criteria[pid] = { ...c, status: 'confirmed', version: c.version + 1, confirmed_by: '이간사', confirmed_at: now(),
      items: input.items.map(i => ({ ...c.items.find(x => x.id === i.id)!, ...i, needs_review: false })) };
    project.criteria = input.items.map(({ id, name, max_score }) => ({ id, name, max_score }));
    save(db);
    return json(db.criteria[pid]);
  }
  if (sub === '/matches') {
    if (!isAdmin && !member) return fail(403, '권한이 없습니다.');
    const ids = Object.fromEntries(db.documents.filter(d => d.project_id === pid && d.kind === 'proposal' && d.job.status === 'done').map(d => [d.vendor_id!, d.id]));
    return json(matches(ids).filter(x => ids[x.vendor_id]));
  }
  if (sub === '/ask' && method === 'POST') {
    if (!isAdmin && !member) return fail(403, '이 사업의 문서에 질문할 권한이 없습니다.');
    return json(ask(db, pid, String(body?.question ?? ''), String(body?.scope ?? 'all')));
  }

  if (sub === '/results') {
    if (!isAdmin && !chair) return fail(403, '결과는 관리자와 위원장만 볼 수 있습니다. (mock 가정)');
    return json(results(db, pid));
  }
  if (sub === '/results/detail') {
    if (!isAdmin && !chair) return fail(403, '결과는 관리자와 위원장만 볼 수 있습니다. (mock 가정)');
    if (!allSubmitted(db, pid)) return fail(409, `전원 제출 전에는 결과를 볼 수 없습니다. (${submittedSheets(db, pid).length}/${selected(db, pid).length} 제출)`);
    return json({
      members: submittedSheets(db, pid).map(s => ({ evaluator_id: s.evaluator_id, name: candidateName(db, s.evaluator_id), submitted_at: s.submitted_at!,
        totals: Object.fromEntries(project.vendor_ids.map(v => [v, s.scores.filter(x => x.vendor_id === v).reduce((a, x) => a + x.score, 0)])) })),
      confirmation: db.confirmations[pid] ?? null,
    } satisfies ResultsDetail);
  }
  if (sub === '/results/confirm' && method === 'POST') {
    if (!chair) return fail(403, '위원장만 결과를 확인할 수 있습니다. (mock 가정)');
    if (!allSubmitted(db, pid)) return fail(409, '모든 위원이 제출해야 확인할 수 있습니다.');
    if (db.confirmations[pid]) return fail(409, '이미 확인된 결과입니다.');
    if (body?.attested !== true) return fail(422, '확인 내용에 동의해 주세요.');
    db.confirmations[pid] = { confirmed_by: candidateName(db, me), confirmed_at: now() }; save(db);
    return json(db.confirmations[pid]);
  }

  if (sub.startsWith('/evaluations/me')) {
    if (isAdmin || !member) return fail(403, '배정된 본위원만 평가표에 접근할 수 있습니다.');
    const key = `${pid}:${me}`;
    const sheet = db.sheets[key];
    if (method === 'GET') return json(sheet ?? null);
    if (isClosed(db, pid)) return fail(409, CLOSED_MSG);
    if (flags.saveFail) throw new TypeError('Failed to fetch (시연 도구: 저장 실패)');
    if (db.criteria[pid]?.status !== 'confirmed') return fail(409, '평가기준이 확정되지 않았습니다.');
    if (!db.pledges[key]) return fail(403, '청렴서약 후 평가할 수 있습니다.');
    if (sheet?.status === 'submitted') return fail(409, '제출된 평가표는 수정할 수 없습니다.');
    if ((sheet?.version ?? 0) !== body?.expected_version) return fail(409, '다른 곳에서 먼저 저장되었습니다. 서버 내용을 확인해 주세요.');
    const base = sheet ?? { id: `sheet-${key}`, project_id: pid, evaluator_id: me, scores: [], opinion: '', status: 'draft' as const,
      submitted_at: null, version: 0, updated_at: now() };
    if (sub === '/evaluations/me/submit') {
      if (body?.attested !== true) return fail(422, '제출 확인에 동의해 주세요.');
      const missing = project.vendor_ids.length * project.criteria.length - base.scores.length;
      if (missing > 0) return fail(422, `입력하지 않은 항목이 ${missing}개 있습니다.`);
      db.sheets[key] = { ...base, status: 'submitted', submitted_at: now(), version: base.version + 1, updated_at: now() };
    } else {
      const error = validateScores(project, body?.scores ?? []);
      if (error) return fail(422, error);
      if (String(body?.opinion ?? '').length > 4000) return fail(422, '의견은 4000자 이내로 입력해 주세요.');
      db.sheets[key] = { ...base, scores: body.scores, opinion: body.opinion ?? '', version: base.version + 1, updated_at: now() };
    }
    save(db);
    const { updated_at: _u, ...out } = db.sheets[key];
    return json(out);
  }
  return fail(404, `mock에 없는 경로: ${method} ${pathname}`);
}

export async function mockFetch(input: Request): Promise<Response> {
  await new Promise(r => setTimeout(r, getFlags().slow ? 2000 : 150));
  return handle(input);
}
