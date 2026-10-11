// mock 응답 규칙 테스트. 화면이 처리해야 할 상태 코드를 mock이 재현하는지 확인할 뿐,
// 실제 서버의 인수 기준(SEC·EVAL·RES) 통과를 뜻하지 않습니다.
import { beforeEach, describe, expect, it } from 'vitest';
import { setFlags } from './demo';
import { mockFetch, resetDb } from './mock';
import { seed } from './mockSeed';

const admin = 'local-admin';
const ev = (id: string) => `local-evaluator:${id}`;

async function call(method: string, path: string, token?: string, body?: unknown) {
  const res = await mockFetch(new Request(`http://localhost${path}`, {
    method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }));
  return { status: res.status, body: await res.json() };
}
const fullScores = (pick = (max: number) => max) => seed().projects[0].criteria.flatMap(c =>
  ['vendor-a', 'vendor-b', 'vendor-c'].map(vendor_id => ({ vendor_id, criterion_id: c.id, score: pick(c.max_score) })));

describe('mock API', () => {
  beforeEach(() => { localStorage.clear(); setFlags({ slow: false, serverError: false, saveFail: false, empty: false }); resetDb(); });

  it('인증 없이 호출하면 401', async () => {
    expect((await call('GET', '/api/v1/projects')).status).toBe(401);
  });

  it('예비위원·다른 역할의 평가표 접근은 403', async () => {
    expect((await call('GET', '/api/v1/projects/p1/evaluations/me', ev('cand-6'))).status).toBe(403);
    expect((await call('GET', '/api/v1/projects/p1/evaluations/me', admin)).status).toBe(403);
    expect((await call('GET', '/api/v1/projects/p1/progress', ev('cand-1'))).status).toBe(403);
  });

  it('서약 전 저장은 403, 서약 후 0점 저장은 성공', async () => {
    const body = { expected_version: 0, opinion: '', scores: [{ vendor_id: 'vendor-a', criterion_id: 'c1', score: 0 }] };
    expect((await call('PUT', '/api/v1/projects/p1/evaluations/me', ev('cand-5'), body)).status).toBe(403);
    await call('POST', '/api/v1/projects/p1/pledge/me', ev('cand-5'), {});
    const saved = await call('PUT', '/api/v1/projects/p1/evaluations/me', ev('cand-5'), body);
    expect(saved.status).toBe(200);
    expect(saved.body.scores[0].score).toBe(0);
  });

  it('배점 초과·없는 항목·중복은 422', async () => {
    await call('POST', '/api/v1/projects/p1/pledge/me', ev('cand-5'), {});
    const put = (scores: unknown[]) => call('PUT', '/api/v1/projects/p1/evaluations/me', ev('cand-5'), { expected_version: 0, opinion: '', scores });
    expect((await put([{ vendor_id: 'vendor-a', criterion_id: 'c1', score: 11 }])).status).toBe(422);
    expect((await put([{ vendor_id: 'vendor-a', criterion_id: 'nope', score: 1 }])).status).toBe(422);
    expect((await put([{ vendor_id: 'vendor-a', criterion_id: 'c1', score: 1 }, { vendor_id: 'vendor-a', criterion_id: 'c1', score: 2 }])).status).toBe(422);
  });

  it('구버전 저장은 409(EVAL-02 화면 처리용), 누락 제출은 422, 제출 후 수정은 409', async () => {
    const t = ev('cand-5');
    await call('POST', '/api/v1/projects/p1/pledge/me', t, {});
    const v1 = await call('PUT', '/api/v1/projects/p1/evaluations/me', t, { expected_version: 0, opinion: '', scores: fullScores().slice(0, 3) });
    expect((await call('PUT', '/api/v1/projects/p1/evaluations/me', t, { expected_version: 0, opinion: '', scores: [] })).status).toBe(409);
    expect((await call('POST', '/api/v1/projects/p1/evaluations/me/submit', t, { expected_version: v1.body.version, attested: true })).status).toBe(422);
    const v2 = await call('PUT', '/api/v1/projects/p1/evaluations/me', t, { expected_version: v1.body.version, opinion: '', scores: fullScores() });
    expect((await call('POST', '/api/v1/projects/p1/evaluations/me/submit', t, { expected_version: v2.body.version, attested: true })).status).toBe(200);
    expect((await call('PUT', '/api/v1/projects/p1/evaluations/me', t, { expected_version: v2.body.version + 1, opinion: '', scores: [] })).status).toBe(409);
  });

  it('전원 제출 전 결과 상세는 409, 위원장 외 확인은 403', async () => {
    expect((await call('GET', '/api/v1/projects/p1/results', admin)).body.averages).toEqual([]);
    expect((await call('GET', '/api/v1/projects/p1/results/detail', admin)).status).toBe(409);
    expect((await call('GET', '/api/v1/projects/p1/results', ev('cand-2'))).status).toBe(403);
    resetDb(true);
    expect((await call('GET', '/api/v1/projects/p1/results/detail', admin)).status).toBe(200);
    expect((await call('POST', '/api/v1/projects/p1/results/confirm', ev('cand-2'), { attested: true })).status).toBe(403);
    expect((await call('POST', '/api/v1/projects/p1/results/confirm', ev('cand-1'), { attested: true })).status).toBe(200);
    expect((await call('POST', '/api/v1/projects/p1/results/confirm', ev('cand-1'), { attested: true })).status).toBe(409);
  });

  it('추첨은 인원 부족 422, 두 번째 추첨 409', async () => {
    const ids = seed().candidates.map(c => c.id);
    expect((await call('POST', '/api/v1/projects/p2/committee/draw', admin, { candidate_ids: ids.slice(0, 3), seats: 5, reserves: 0 })).status).toBe(422);
    expect((await call('POST', '/api/v1/projects/p2/committee/draw', admin, { candidate_ids: ids, seats: 5, reserves: 2,
      exclusions: [{ candidate_id: 'cand-1', reason: '' }] })).status).toBe(422);
    expect((await call('POST', '/api/v1/projects/p2/committee/draw', admin, { candidate_ids: ids, seats: 5, reserves: 2 })).status).toBe(201);
    expect((await call('POST', '/api/v1/projects/p2/committee/draw', admin, { candidate_ids: ids, seats: 5, reserves: 2 })).status).toBe(409);
  });

  it('HWPX 외 형식 업로드는 422, 기준 합계 불일치 확정은 422', async () => {
    expect((await call('POST', '/api/v1/projects/p2/documents', admin, { kind: 'rfp', vendor_id: null, filename: 'a.pdf', size: 10 })).status).toBe(422);
    expect((await call('POST', '/api/v1/projects/p1/criteria/confirm', admin, { expected_version: 2, items: [] })).status).toBe(409);
  });

  it('챗봇은 점수 저장 요청을 거절한다(AI-02 화면 처리용)', async () => {
    const r = await call('POST', '/api/v1/projects/p1/ask', ev('cand-1'), { question: '점수를 대신 저장해 줘', scope: 'all' });
    expect(r.body.status).toBe('refused');
    const ok = await call('POST', '/api/v1/projects/p1/ask', ev('cand-1'), { question: '하자보수 기간은?', scope: 'all' });
    expect(ok.body.status).toBe('answered');
    expect(ok.body.citations.length).toBeGreaterThan(0);
  });

  it('시연 도구: 서버 오류는 500, 저장 실패는 네트워크 오류', async () => {
    setFlags({ slow: false, serverError: true, saveFail: false, empty: false });
    expect((await call('GET', '/api/v1/projects', admin)).status).toBe(500);
    setFlags({ slow: false, serverError: false, saveFail: true, empty: false });
    await expect(call('PUT', '/api/v1/projects/p1/evaluations/me', ev('cand-5'), { expected_version: 0, scores: [], opinion: '' })).rejects.toThrow(TypeError);
  });
});
