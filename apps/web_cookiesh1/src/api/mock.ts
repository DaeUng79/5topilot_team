// In-memory mock of the team API for screen development without apps/api.
// Enabled with VITE_USE_MOCK=1. All data is synthetic and resets on page reload.
import type { components } from './schema';

type S = components['schemas'];

const criteria: S['Criterion'][] = [
  ['c1', '사업 이해도', 10], ['c2', '추진 전략', 10], ['c3', '기술 방안', 20], ['c4', '보안 방안', 10],
  ['c5', '품질 관리', 10], ['c6', '프로젝트 관리', 10], ['c7', '유지보수 지원', 10],
].map(([id, name, max_score]) => ({ id: id as string, name: name as string, max_score: max_score as number }));
const vendorIds = ['vendor-a', 'vendor-b', 'vendor-c'];

const projects: S['ProjectRead'][] = [
  { id: 'p1', name: '(가상) 정보시스템 구축 사업', department: '정보화사업팀', criteria, vendor_ids: vendorIds },
];
const candidates: S['CandidateRead'][] = [
  ['김가상', '가상대학교', '정보시스템'], ['이예시', '예시연구원', '보안'], ['박샘플', '샘플기술(주)', '데이터'],
  ['최테스트', '테스트대학교', 'SW공학'], ['정모의', '모의연구소', '네트워크'],
].map(([name, organization, specialty], i) => ({ id: `cand-${i + 1}`, name, organization, specialty, active: true }));
const draws = new Map<string, S['DrawRead']>();
const sheets = new Map<string, S['SheetRead']>();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fail = (status: number, detail: string) => json({ detail }, status);
const now = () => new Date().toISOString();

function evaluatorOf(req: Request) {
  return req.headers.get('Authorization')?.match(/local-evaluator:(.+)$/)?.[1];
}

function results(projectId: string): S['ResultsRead'] {
  const draw = draws.get(projectId);
  const expected = draw?.selected_ids.length ?? 0;
  const submitted = [...sheets.values()].filter(s => s.project_id === projectId && s.status === 'submitted');
  const complete = expected > 0 && submitted.length === expected;
  return {
    expected, submitted: submitted.length, status: complete ? 'technical_complete' : 'collecting',
    calculation: '제안사별 (위원 기술점수 합계)의 단순 평균 (mock)',
    averages: complete ? vendorIds.map(vendor_id => ({
      vendor_id,
      technical_average: submitted.reduce((sum, s) =>
        sum + s.scores.filter(x => x.vendor_id === vendor_id).reduce((a, x) => a + x.score, 0), 0) / submitted.length,
    })) : [],
  };
}

async function handle(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);
  const body = req.method === 'GET' ? undefined : await req.json().catch(() => undefined);
  const m = pathname.match(/^\/api\/v1\/projects\/([^/]+)(\/.*)?$/);
  const projectId = m?.[1];
  const sub = m?.[2] ?? '';

  if (pathname === '/api/v1/health') return json({ status: 'ok', demo_auth: true });
  if (pathname === '/api/v1/ai/status') return json({ status: 'not_connected', detail: 'mock 모드' });
  if (pathname === '/api/v1/projects') {
    if (req.method === 'GET') return json(projects);
    const created = { id: `p${projects.length + 1}`, criteria, vendor_ids: vendorIds, ...body };
    projects.push(created);
    return json(created, 201);
  }
  if (pathname === '/api/v1/committee/candidates') {
    if (req.method === 'GET') return json(candidates);
    const created = { id: `cand-${candidates.length + 1}`, active: true, ...body };
    candidates.push(created);
    return json(created, 201);
  }
  if (!projectId || !projects.some(p => p.id === projectId)) return fail(404, '사업을 찾을 수 없습니다.');

  if (sub === '/committee/draw') {
    if (req.method === 'GET') return json(draws.get(projectId) ?? null);
    if (draws.has(projectId)) return fail(409, '이미 추첨이 확정되었습니다.');
    const { candidate_ids, seats, reserves } = body as S['DrawCreate'];
    const shuffled = [...candidate_ids].sort(() => Math.random() - 0.5);
    const draw: S['DrawRead'] = {
      id: `draw-${projectId}`, project_id: projectId, actor_id: 'local-admin', created_at: now(), method: 'mock-random',
      selected_ids: shuffled.slice(0, seats), reserve_ids: shuffled.slice(seats, seats + reserves),
      candidate_snapshot: candidates.filter(c => candidate_ids.includes(c.id))
        .map(({ id, name, organization, specialty }) => ({ id, name, organization, specialty })),
      snapshot_sha256: 'mock',
    };
    draws.set(projectId, draw);
    return json(draw, 201);
  }
  if (sub === '/results') return json(results(projectId));

  if (sub.startsWith('/evaluations/me')) {
    const evaluator = evaluatorOf(req);
    if (!evaluator || !draws.get(projectId)?.selected_ids.includes(evaluator)) return fail(403, '배정된 평가위원만 접근할 수 있습니다.');
    const key = `${projectId}:${evaluator}`;
    const sheet = sheets.get(key);
    if (req.method === 'GET') return json(sheet ?? null);
    if (sheet?.status === 'submitted') return fail(409, '제출된 평가표는 수정할 수 없습니다.');
    if ((sheet?.version ?? 0) !== body.expected_version) return fail(409, '다른 곳에서 먼저 저장되었습니다. 다시 불러오세요.');
    const next: S['SheetRead'] = sheet ?? {
      id: `sheet-${key}`, project_id: projectId, evaluator_id: evaluator, scores: [], opinion: '',
      status: 'draft', submitted_at: null, version: 0,
    };
    const updated = sub === '/evaluations/me/submit'
      ? { ...next, status: 'submitted' as const, submitted_at: now(), version: next.version + 1 }
      : { ...next, scores: body.scores, opinion: body.opinion, version: next.version + 1 };
    sheets.set(key, updated);
    return json(updated);
  }
  return fail(404, `mock에 없는 경로: ${req.method} ${pathname}`);
}

export async function mockFetch(input: Request): Promise<Response> {
  await new Promise(r => setTimeout(r, 200));
  return handle(input);
}
