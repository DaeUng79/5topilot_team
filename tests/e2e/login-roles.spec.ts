import { test, expect, request } from '@playwright/test';
import { API, loginAsAdmin } from './helpers';

// 로그인·권한별 화면: ① 미로그인 → 로그인 화면 ② admin → 관리자 메뉴 4개 ③ 평가위원 본인확인 → 메뉴 2개
// ④ 배정 사업·허용된 결과만 ⑤ 평가위원 세션의 관리자 API 차단 ⑥ 로그아웃 ⑦ 평가표 작성·저장·제출·서명.
test('로그인 전에는 로그인 화면만 보이고, 권한에 따라 관리자 4개·평가위원 2개 메뉴가 열린다', async ({ page }) => {
  // ① 로그인하지 않으면 로그인 화면. 잘못된 비밀번호는 거절된다.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '로그인' })).toBeVisible();
  await expect(page.locator('aside.sidebar')).toHaveCount(0);
  await page.getByLabel('아이디').fill('admin');
  await page.getByLabel('비밀번호').fill('wrong');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('아이디 또는 비밀번호');

  // ② admin → 관리자 메뉴 4개, 오른쪽 상단에 사용자·권한·로그아웃. 새로고침해도 유지된다.
  await loginAsAdmin(page);
  await expect(page.locator('aside.sidebar button')).toHaveText(['사업 관리', '평가위원 등록·추첨', '평가·제출·취합', '결과·서명·리포트']);
  await expect(page.getByTestId('user-box')).toContainText('사업관리자');
  await page.getByLabel('사업명', { exact: true }).fill('E2E 권한 사업');
  await page.getByLabel('담당 부서').fill('검증팀');
  await page.getByRole('button', { name: '사업 등록', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'E2E 권한 사업' })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('user-box')).toContainText('사업관리자');
  await expect(page.locator('aside.sidebar button')).toHaveCount(4);
  await page.screenshot({ path: 'artifacts/login-admin.png', fullPage: true });

  // 위원 등록(생년월일 포함)·추첨은 간사 API로 준비한다.
  const api = await request.newContext({ baseURL: API, extraHTTPHeaders: { Authorization: 'Bearer local-admin' } });
  const projects: { id: string; name: string }[] = await (await api.get('/api/v1/projects')).json();
  const project = projects.find(p => p.name === 'E2E 권한 사업')!;
  const member = await (await api.post('/api/v1/committee/candidates', {
    data: { name: '권한위원', organization: '가상기관', specialty: '정보시스템', birth_date: '1987-12-23' },
  })).json();
  expect((await api.post('/api/v1/committee/candidates', {
    data: { name: '미선정위원', organization: '가상기관', specialty: '보안', birth_date: '1990-07-15' },
  })).status()).toBe(201);
  expect((await api.post(`/api/v1/projects/${project.id}/committee/draw`, {
    data: { candidate_ids: [member.id], seats: 1, reserves: 0 },
  })).status()).toBe(201);

  // ⑥ 로그아웃 → 로그인 화면. 새로고침해도 로그인 화면이다.
  await page.getByRole('button', { name: '로그아웃' }).click();
  await expect(page.getByRole('heading', { name: '로그인' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '로그인' })).toBeVisible();

  // ③ 평가위원 본인확인 로그인. 미선정 위원과 틀린 생년월일은 거절된다.
  await page.getByRole('tab', { name: '평가위원' }).click();
  await page.getByLabel('이름', { exact: true }).fill('미선정위원');
  await page.getByLabel('생년월일 6자리').fill('900715');
  await page.getByRole('button', { name: '본인확인 후 입장' }).click();
  await expect(page.getByRole('alert')).toContainText('선정된 평가 사업이 없어');
  await page.getByLabel('이름', { exact: true }).fill('권한위원');
  await page.getByLabel('생년월일 6자리').fill('000000');
  await page.getByRole('button', { name: '본인확인 후 입장' }).click();
  await expect(page.getByRole('alert')).toContainText('이름 또는 생년월일');
  const verified = page.waitForResponse(r => r.url().endsWith('/evaluator-access/login') && r.status() === 200);
  await page.getByLabel('생년월일 6자리').fill('871223');
  await page.getByRole('button', { name: '본인확인 후 입장' }).click();
  expect(await (await verified).text()).not.toContain('871223');
  await expect(page.locator('aside.sidebar button')).toHaveText(['평가·제출·취합', '결과·서명·리포트']);
  await expect(page.getByTestId('user-box')).toContainText('권한위원');
  await expect(page.getByTestId('user-box')).toContainText('평가위원');
  // ④ 배정된 사업만 보인다.
  await expect(page.locator('select').first().locator('option')).toHaveText(['E2E 권한 사업']);
  await expect(page.getByRole('button', { name: '사업 관리', exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/login-evaluator.png', fullPage: true });

  // ⑤ 평가위원 세션으로 관리자 API를 직접 호출해도 서버가 403으로 막는다.
  const token = await page.evaluate(() => (JSON.parse(sessionStorage.getItem('simsa.session') ?? '{}') as { token?: string }).token ?? '');
  expect(token).not.toBe('');
  const evaluatorApi = await request.newContext({ baseURL: API, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
  for (const path of ['/api/v1/projects', '/api/v1/committee/candidates', `/api/v1/projects/${project.id}/setup`,
    `/api/v1/projects/${project.id}/results/summary`, `/api/v1/projects/${project.id}/results/report`]) {
    expect((await evaluatorApi.get(path)).status(), path).toBe(403);
  }
  expect((await evaluatorApi.post('/api/v1/projects', { data: { name: 'x', department: 'y' } })).status()).toBe(403);

  // ⑦ 평가표 작성·저장·제출·서명은 그대로 동작한다.
  const inputs = page.locator('input.score');
  await expect(inputs).toHaveCount(21);
  for (let i = 0; i < 21; i++) await inputs.nth(i).fill('5');
  await page.getByRole('button', { name: '평가표 저장', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('저장되었습니다.');
  await page.getByLabel('본인의 판단으로 작성했으며', { exact: false }).check();
  await page.getByRole('button', { name: '최종 제출', exact: true }).click();
  await expect(page.getByText('제출 완료 · 수정 잠금', { exact: true })).toBeVisible();
  await expect(page.getByText('평가표 SHA-256:', { exact: false })).toBeVisible();

  // ④ 결과 메뉴: 본인 서명 내역은 보이고 종합 결과는 열람이 제한된다.
  await page.getByRole('button', { name: '결과·서명·리포트', exact: true }).click();
  await expect(page.getByText('평가표 SHA-256:', { exact: false })).toBeVisible();
  await expect(page.getByText('위원장과 간사만 열람', { exact: false })).toBeVisible();
  await page.screenshot({ path: 'artifacts/evaluator-results.png', fullPage: true });
  await page.reload();
  await expect(page.getByTestId('user-box')).toContainText('권한위원');
  await page.getByRole('button', { name: '로그아웃' }).click();
  await expect(page.getByRole('heading', { name: '로그인' })).toBeVisible();
});
