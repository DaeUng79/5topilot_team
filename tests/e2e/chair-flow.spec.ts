import { test, expect, request, type Page } from '@playwright/test';
import { API, loginAsAdmin } from './helpers';

// 평가위원장 지정·최종 확인 흐름(COM-03 위원장 부분, RES-03).
// ① 간사가 추첨 결과의 본위원 중 위원장을 지정(라디오·저장·배지) ② 사유를 남기고 변경 ③ 전원 제출 뒤
// 일반 위원은 종합 결과·확정 접근 불가 ④ 위원장 로그인 → 현황·집계 확인 동의 + 마우스 자필 서명 → 최종 서명·확정
// ⑤ 봉인 뒤 간사 화면·결과표에 위원장 이름·서명 이미지·일시 표시, 위원장 변경·평가표 수정은 409.
// 사업·위원·추첨·기준 확정·채점은 API로 준비한다. 합성 생년월일(등록 YYYY-MM-DD, 입력 YYMMDD).
const BIRTH_DATES = ['1975-03-05', '1987-12-23', '1990-07-15'];
// API 직접 호출용 합성 서명(1×1 PNG). 화면 흐름은 캔버스에 마우스로 그린다.
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

async function loginAsEvaluator(page: Page, name: string, yymmdd: string) {
  await page.goto('/');
  await page.getByRole('tab', { name: '평가위원' }).click();
  await page.getByLabel('이름', { exact: true }).fill(name);
  await page.getByLabel('생년월일 6자리').fill(yymmdd);
  await page.getByRole('button', { name: '본인확인 후 입장' }).click();
  await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible();
}

async function logout(page: Page) {
  await page.getByRole('button', { name: '로그아웃' }).click();
  await expect(page.getByRole('heading', { name: '로그인' })).toBeVisible();
}

test('간사가 본위원 중 위원장을 지정·변경하고, 위원장만 전원 제출 뒤 결과를 확인·봉인한다', async ({ page }) => {
  const api = await request.newContext({ baseURL: API, extraHTTPHeaders: { Authorization: 'Bearer local-admin' } });
  const project = await (await api.post('/api/v1/projects', { data: { name: 'E2E 위원장 사업', department: '검증팀' } })).json();
  const base = `/api/v1/projects/${project.id}`;
  const names: Record<string, string> = {};
  const yymmdd: Record<string, string> = {};
  const ids: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const candidate = await (await api.post('/api/v1/committee/candidates', {
      data: { name: `위원장E2E ${i}`, organization: '가상기관', specialty: '정보시스템', birth_date: BIRTH_DATES[i - 1] },
    })).json();
    ids.push(candidate.id); names[candidate.id] = candidate.name;
    yymmdd[candidate.id] = BIRTH_DATES[i - 1].replaceAll('-', '').slice(2);
  }
  const draw = await (await api.post(`${base}/committee/draw`, { data: { candidate_ids: ids, seats: 2, reserves: 1 } })).json();
  const [first, second] = draw.selected_ids as string[];
  expect((await api.post(`${base}/criteria/confirm`, { data: { expected_version: 0 } })).status()).toBe(201);

  // ① 간사: 추첨 결과에서 본위원 1명을 위원장으로 지정한다. 예비위원에는 라디오가 없다.
  await loginAsAdmin(page);
  await page.locator('select').first().selectOption(project.id);
  await page.getByRole('button', { name: '평가위원 등록·추첨', exact: true }).click();
  await expect(page.getByRole('heading', { name: '추첨 결과 확정' })).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(2);
  await expect(page.getByTestId('chair-status')).toContainText('본위원 중 1명을 평가위원장으로 지정하세요');
  const saveChair = page.getByRole('button', { name: '위원장 지정 저장' });
  await expect(saveChair).toBeDisabled();
  await page.getByRole('radio', { name: `${names[first]} 위원장 지정` }).check();
  await saveChair.click();
  await expect(page.getByTestId('chair-status')).toContainText(`현재 평가위원장: ${names[first]}`);
  await expect(page.getByText('평가위원장', { exact: true })).toHaveCount(1);
  await expect(saveChair).toBeDisabled();
  await page.screenshot({ path: 'artifacts/committee-chair.png', fullPage: true });

  // ② 다른 본위원으로 바꾸려면 사유가 필요하고, 변경 이력이 남는다.
  await page.getByRole('radio', { name: `${names[second]} 위원장 지정` }).check();
  await expect(saveChair).toBeDisabled();
  await page.getByLabel('변경 사유').fill('기존 위원장 일정 사유로 교체');
  await saveChair.click();
  await expect(page.getByTestId('chair-status')).toContainText(`현재 평가위원장: ${names[second]}`);
  await page.getByText('위원장 지정 이력 (2)').click();
  await expect(page.getByText('사유: 기존 위원장 일정 사유로 교체', { exact: false })).toBeVisible();
  expect((await api.get(`${base}/committee/chair`)).ok()).toBe(true);
  expect((await (await api.get(`${base}/committee/chair`)).json()).chair_id).toBe(second);

  // 간사 결과 화면: 위원장 이름과 제출 대기 안내.
  await page.getByRole('button', { name: '결과·서명·리포트', exact: true }).click();
  await expect(page.getByText(`위원장 ${names[second]} · 2명 제출 대기 중입니다.`)).toBeVisible();
  await logout(page);

  // ③ 두 본위원이 채점·제출·서명한다(API). 일반 위원(first)은 종합 결과를 볼 수 없고 확정도 403.
  const scores = project.vendor_ids.flatMap((vendor_id: string) =>
    project.criteria.map((c: { id: string }) => ({ vendor_id, criterion_id: c.id, score: 5 })));
  for (const member of [first, second]) {
    const evaluator = await request.newContext({ baseURL: API, extraHTTPHeaders: { Authorization: `Bearer local-evaluator:${member}` } });
    const saved = await (await evaluator.put(`${base}/evaluations/me`, { data: { expected_version: 0, scores } })).json();
    expect((await evaluator.post(`${base}/evaluations/me/submit`, { data: { expected_version: saved.version, attested: true } })).status()).toBe(200);
  }
  await loginAsEvaluator(page, names[first], yymmdd[first]);
  await page.getByRole('button', { name: '결과·서명·리포트', exact: true }).click();
  await expect(page.getByText('제출 완료 · 수정 잠금', { exact: true })).toBeVisible();
  await expect(page.getByText('위원장과 간사만 열람', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: '최종 서명 및 평가결과 확정' })).toHaveCount(0);
  const memberToken = await page.evaluate(() => (JSON.parse(sessionStorage.getItem('simsa.session') ?? '{}') as { token?: string }).token ?? '');
  const memberApi = await request.newContext({ baseURL: API, extraHTTPHeaders: { Authorization: `Bearer ${memberToken}` } });
  expect((await memberApi.post(`${base}/results/confirm`, { data: { reviewed: true, signature_image: TINY_PNG } })).status()).toBe(403);
  expect((await api.post(`${base}/results/confirm`, { data: { reviewed: true, signature_image: TINY_PNG } })).status()).toBe(403); // 간사도 대리 서명 불가
  expect((await memberApi.get(`${base}/results/summary`)).status()).toBe(403);
  await logout(page);

  // ④ 위원장(second) 로그인: 제출·서명 현황과 집계를 보고, 확인 동의와 자필 서명이 모두 있어야 확정할 수 있다.
  await loginAsEvaluator(page, names[second], yymmdd[second]);
  await page.getByRole('button', { name: '결과·서명·리포트', exact: true }).click();
  await expect(page.getByRole('heading', { name: '위원장 최종 확인' })).toBeVisible();
  await expect(page.getByRole('cell', { name: `${names[second]} (위원장)` })).toBeVisible();
  // 본인 평가표 요약(3칸)과 구분해 위원장 패널의 집계 표만 센다.
  const chairPanel = page.locator('section.panel', { has: page.getByRole('heading', { name: '위원장 최종 확인' }) });
  await expect(chairPanel.getByRole('cell', { name: '35.00', exact: true })).toHaveCount(3);
  // 서명자 이름은 자동 표시되고, 동의 체크와 자필 서명이 모두 있어야 확정 버튼이 열린다.
  const seal = page.getByRole('button', { name: '최종 서명 및 평가결과 확정' });
  await expect(seal).toBeDisabled();
  await expect(chairPanel.getByText(`서명자: ${names[second]}`, { exact: false })).toBeVisible();
  await page.getByLabel('평가결과를 확인하였습니다', { exact: false }).check();
  await expect(seal).toBeDisabled();
  const pad = page.getByRole('img', { name: '서명 입력 영역' });
  async function sign() {
    const box = (await pad.boundingBox())!;
    await page.mouse.move(box.x + 30, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 30, { steps: 12 });
    await page.mouse.move(box.x + box.width - 30, box.y + box.height - 30, { steps: 12 });
    await page.mouse.up();
  }
  await sign();
  await expect(page.getByRole('img', { name: '서명 미리보기' })).toBeVisible();
  await expect(seal).toBeEnabled();
  // 지우기 → 다시 작성.
  await page.getByRole('button', { name: '서명 지우기' }).click();
  await expect(page.getByRole('img', { name: '서명 미리보기' })).toHaveCount(0);
  await expect(seal).toBeDisabled();
  await sign();
  await expect(seal).toBeEnabled();
  await page.screenshot({ path: 'artifacts/chair-signing.png', fullPage: true });
  await seal.click();
  await expect(page.getByText(`서명 완료 · 평가위원장 ${names[second]}`, { exact: false })).toBeVisible();
  await expect(page.getByRole('img', { name: '평가위원장 서명' })).toBeVisible();
  await expect(page.getByText('서명 SHA-256:', { exact: false })).toBeVisible();
  // 새로고침해도 저장된 서명과 확정 상태가 서버에서 다시 조회되고, 서명 입력은 더 이상 보이지 않는다.
  await page.reload();
  await expect(page.getByRole('img', { name: '평가위원장 서명' })).toBeVisible();
  await expect(page.getByRole('img', { name: '서명 입력 영역' })).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/chair-confirmed.png', fullPage: true });
  await logout(page);

  // ⑤ 봉인 뒤: 간사 화면에 위원장 확정, 위원장 변경·평가표 수정은 409, 점수는 그대로.
  await loginAsAdmin(page);
  await page.locator('select').first().selectOption(project.id);
  await page.getByRole('button', { name: '결과·서명·리포트', exact: true }).click();
  await expect(page.getByText('위원장 확정', { exact: true })).toBeVisible();
  await expect(page.getByText(`서명 완료 · 평가위원장 ${names[second]}`, { exact: false })).toBeVisible();
  await expect(page.getByRole('img', { name: '평가위원장 서명' })).toBeVisible();
  await expect(page.getByTestId('results-submitted')).toHaveText('2 / 2');
  // 결과표(인쇄·JSON 대상)에도 위원장 이름·서명 이미지·일시가 들어간다.
  await page.getByRole('button', { name: '결과표 보기' }).click();
  await expect(page.getByRole('heading', { name: '평가위원장 서명' })).toBeVisible();
  await expect(page.getByRole('img', { name: '평가위원장 서명' })).toHaveCount(2);
  await page.screenshot({ path: 'artifacts/report-signed.png', fullPage: true });
  await page.getByRole('button', { name: '평가위원 등록·추첨', exact: true }).click();
  await expect(page.getByTestId('chair-status')).toContainText('결과가 확정되어 위원장을 변경할 수 없습니다.');
  await expect(page.getByRole('radio', { name: `${names[first]} 위원장 지정` })).toBeDisabled();
  expect((await api.put(`${base}/committee/chair`, { data: { chair_id: first, reason: '확정 뒤 변경' } })).status()).toBe(409);
  const firstApi = await request.newContext({ baseURL: API, extraHTTPHeaders: { Authorization: `Bearer local-evaluator:${first}` } });
  const sheet = await (await firstApi.get(`${base}/evaluations/me`)).json();
  expect(sheet.status).toBe('submitted');
  expect((await firstApi.put(`${base}/evaluations/me`, { data: { expected_version: sheet.version, scores: [] } })).status()).toBe(409);
});
