import { test, expect, request } from '@playwright/test';

// 평가위원 본인확인 → 채점·저장 → 확인·제출 → 관리자 결과 화면 (기능 7·8·10).
// 사업·위원·추첨·기준 확정은 간사 영역이라 API로 준비한다. 위원장 지정(COM-03)이 없어 확정은 검증하지 않는다.
const API = 'http://127.0.0.1:8000'; // 경로는 /api/v1/... 로 적는다(baseURL에 절대 경로를 합치면 prefix가 사라진다).
const DEMO_CODE = '000000'; // scripts/e2e-api.mjs의 DEMO_VERIFY_CODE와 같다. 응답에 노출되면 실패한다.

test('평가위원이 본인확인 뒤 채점·제출하고 관리자가 취합 결과를 본다', async ({ page }) => {
  const api = await request.newContext({ baseURL: API, extraHTTPHeaders: { Authorization: 'Bearer local-admin' } });
  const created = await api.post('/api/v1/projects', { data: { name: 'E2E 평가위원 흐름', department: '검증팀' } });
  expect(created.status()).toBe(201);
  const project = await created.json();
  const candidates = [];
  for (let i = 1; i <= 3; i++) {
    candidates.push(await (await api.post('/api/v1/committee/candidates', {
      data: { name: `E2E위원 ${i}`, organization: '가상기관', specialty: '정보시스템' },
    })).json());
  }
  const drawn = await api.post(`/api/v1/projects/${project.id}/committee/draw`, {
    data: { candidate_ids: candidates.map((c: { id: string }) => c.id), seats: 2, reserves: 1 },
  });
  expect(drawn.status()).toBe(201);
  const draw = await drawn.json();
  expect((await api.post(`/api/v1/projects/${project.id}/criteria/confirm`, { data: { expected_version: 0 } })).status()).toBe(201);

  // 예비위원 링크는 들어올 수 없다.
  await page.goto(`/evaluator?project=${project.id}&candidate=${draw.reserve_ids[0]}`);
  await expect(page.getByRole('heading', { name: '접근할 수 없습니다' })).toBeVisible();

  for (const member of draw.selected_ids as string[]) {
    await page.goto(`/evaluator?project=${project.id}&candidate=${member}`);
    await expect(page.getByRole('heading', { name: '평가위원 본인확인' })).toBeVisible();
    await expect(page.getByText('개발용 본인확인 · 실제 인증 아님')).toBeVisible();
    await page.getByRole('button', { name: '인증번호 요청' }).click();
    await expect(page.getByRole('status')).toContainText('채널: demo');
    await page.getByLabel('인증번호 6자리').fill('999999');
    await page.getByLabel('보안 및 청렴 서약', { exact: false }).check();
    await page.getByRole('button', { name: '평가 시작하기' }).click();
    await expect(page.getByRole('alert')).toContainText('인증번호');

    const verified = page.waitForResponse(r => r.url().endsWith('/evaluator-access/verify') && r.status() === 200);
    await page.getByLabel('인증번호 6자리').fill(DEMO_CODE);
    await page.getByRole('button', { name: '평가 시작하기' }).click();
    const body = await (await verified).text();
    expect(body).not.toContain(DEMO_CODE);
    expect(body).not.toContain('"code"');

    await expect(page.getByRole('heading', { name: '평가표 작성' })).toBeVisible();
    const inputs = page.locator('input.score');
    await expect(inputs).toHaveCount(21);
    for (let i = 0; i < 21; i++) await inputs.nth(i).fill('5');
    await page.getByRole('button', { name: '평가표 저장', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('저장되었습니다.');
    await page.getByLabel('본인의 판단으로 작성했으며', { exact: false }).check();
    await page.getByRole('button', { name: '최종 제출', exact: true }).click();
    await expect(page.getByText('제출 완료 · 수정 잠금', { exact: true })).toBeVisible();
    await expect(page.getByText('평가표 SHA-256:', { exact: false })).toBeVisible();
    await expect(page.getByText('법적 전자서명이 아닙니다', { exact: false })).toBeVisible();

    // 새로고침해도 세션이 유지되고 제출 완료 상태가 서버에서 다시 조회된다.
    await page.reload();
    await expect(page.getByText('제출 완료 · 수정 잠금', { exact: true })).toBeVisible();
  }
  await page.screenshot({ path: 'artifacts/evaluator-submitted.png', fullPage: true });

  // 관리자 결과 화면: 전원 제출 뒤 평균·순위 공개, 위원장 미지정 안내.
  await page.goto('/');
  await page.locator('select').first().selectOption(project.id);
  await page.getByRole('button', { name: '결과·서명·리포트', exact: true }).click();
  await expect(page.getByTestId('results-submitted')).toHaveText('2 / 2');
  await expect(page.getByRole('cell', { name: '35.00', exact: true })).toHaveCount(3);
  await expect(page.getByText('위원장이 지정되지 않았습니다', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: '결과표 보기' })).toBeDisabled();
  await page.screenshot({ path: 'artifacts/results-admin.png', fullPage: true });

  // 모바일 폭에서 평가위원 화면이 가로로 넘치지 않는다.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/evaluator?project=${project.id}&candidate=${draw.selected_ids[0]}`);
  await expect(page.getByText('제출 완료 · 수정 잠금', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'artifacts/evaluator-mobile.png', fullPage: true });
});
