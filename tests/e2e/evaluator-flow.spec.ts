import { test, expect, request } from '@playwright/test';
import { loginAsAdmin } from './helpers';

// 평가위원 본인확인(생년월일) → 채점·저장 → 확인·제출 → 관리자 결과 화면 (기능 7·8·10).
// 사업·위원·추첨·기준 확정은 간사 영역이라 API로 준비한다. 위원장 지정(COM-03)이 없어 확정은 검증하지 않는다.
const API = 'http://127.0.0.1:8000'; // 경로는 /api/v1/... 로 적는다(baseURL에 절대 경로를 합치면 prefix가 사라진다).
// 합성 생년월일. 등록은 YYYY-MM-DD, 화면 입력은 뒤 6자리(YYMMDD). 응답에 노출되면 실패한다.
const BIRTH_DATES = ['1975-03-05', '1987-12-23', '1990-07-15'];
const LOCAL_MASTER_CODE = '111111'; // 관리자용 로컬 마스터 번호. APP_ENV=ci(scripts/e2e-api.mjs)에서는 막혀야 하고 화면에 나오지 않는다.

test('평가위원이 생년월일로 본인확인한 뒤 채점·제출하고 관리자가 취합 결과를 본다', async ({ page }) => {
  const api = await request.newContext({ baseURL: API, extraHTTPHeaders: { Authorization: 'Bearer local-admin' } });
  const created = await api.post('/api/v1/projects', { data: { name: 'E2E 평가위원 흐름', department: '검증팀' } });
  expect(created.status()).toBe(201);
  const project = await created.json();
  const yymmdd: Record<string, string> = {};
  const candidates: { id: string }[] = [];
  for (let i = 1; i <= 3; i++) {
    const response = await api.post('/api/v1/committee/candidates', {
      data: { name: `E2E위원 ${i}`, organization: '가상기관', specialty: '정보시스템', birth_date: BIRTH_DATES[i - 1] },
    });
    expect(response.status()).toBe(201);
    const candidate = await response.json();
    expect(JSON.stringify(candidate)).not.toContain('birth_date'); // 등록 응답에 생년월일이 없다.
    yymmdd[candidate.id] = BIRTH_DATES[i - 1].replaceAll('-', '').slice(2);
    candidates.push(candidate);
  }
  const drawn = await api.post(`/api/v1/projects/${project.id}/committee/draw`, {
    data: { candidate_ids: candidates.map(c => c.id), seats: 2, reserves: 1 },
  });
  expect(drawn.status()).toBe(201);
  const draw = await drawn.json();
  expect(JSON.stringify(draw)).not.toContain('birth_date'); // 추첨 스냅샷에도 없다.
  expect((await api.post(`/api/v1/projects/${project.id}/criteria/confirm`, { data: { expected_version: 0 } })).status()).toBe(201);

  // 예비위원 링크는 들어올 수 없다.
  await page.goto(`/evaluator?project=${project.id}&candidate=${draw.reserve_ids[0]}`);
  await expect(page.getByRole('heading', { name: '접근할 수 없습니다' })).toBeVisible();

  for (const member of draw.selected_ids as string[]) {
    await page.goto(`/evaluator?project=${project.id}&candidate=${member}`);
    await expect(page.getByRole('heading', { name: '평가위원 본인확인' })).toBeVisible();
    await expect(page.getByText('개발용 본인확인 · 실제 인증 아님')).toBeVisible();
    await expect(page.getByRole('button', { name: '인증번호 요청' })).toHaveCount(0);
    await expect(page.getByText(LOCAL_MASTER_CODE, { exact: false })).toHaveCount(0); // 마스터 번호는 화면에 없다.
    const input = page.getByLabel('생년월일 6자리');
    await input.fill('12ab34'); // 숫자만 남는다.
    await expect(input).toHaveValue('1234');
    await input.fill('000000');
    await page.getByLabel('보안 및 청렴 서약', { exact: false }).check();
    await page.getByRole('button', { name: '평가 시작하기' }).click();
    await expect(page.getByRole('alert')).toContainText('생년월일이 일치하지 않습니다.');
    // ci에서는 마스터 번호도 거부된다.
    const rejected = page.waitForResponse(r => r.url().endsWith('/evaluator-access/verify') && r.status() === 401);
    await input.fill(LOCAL_MASTER_CODE);
    await page.getByRole('button', { name: '평가 시작하기' }).click();
    await rejected;
    await expect(page.getByRole('alert')).toContainText('생년월일이 일치하지 않습니다.');

    const verified = page.waitForResponse(r => r.url().endsWith('/evaluator-access/verify') && r.status() === 200);
    await input.fill(yymmdd[member]);
    await page.getByRole('button', { name: '평가 시작하기' }).click();
    const body = await (await verified).text();
    expect(body).not.toContain(yymmdd[member]);
    expect(body).not.toContain('"birth_date":'); // method 값은 birth_date일 수 있어 키만 검사

    await expect(page.getByRole('heading', { name: '평가표 작성' })).toBeVisible();
    const inputs = page.locator('input.score');
    await expect(inputs).toHaveCount(21);
    for (let i = 0; i < 21; i++) await inputs.nth(i).fill('5');
    if (member === draw.selected_ids[0]) {
      // 평가항목에 마우스를 올리면 하단에 업체별 제안서 요약 비교 패널이 나타나고, 입력한 점수는 유지된다.
      const panel = page.getByTestId('proposal-compare');
      await page.locator('.criterion-label', { hasText: '사업 이해도' }).hover();
      await expect(panel).toBeVisible();
      await expect(page.getByTestId('compare-criterion')).toHaveText('사업 이해도');
      await expect(panel.locator('.vendor-card')).toHaveCount(3);
      // 새로 등록한 사업에는 요약 자료가 없다(예시 자료는 시작용 샘플 사업 demo-project에만 있다).
      await expect(panel.getByText('제안서 요약 정보가 없습니다.')).toHaveCount(3);
      await expect(panel.getByText('예시 자료', { exact: false })).toHaveCount(0);
      await page.locator('.criterion-label', { hasText: '수행 방법론' }).hover();
      await expect(page.getByTestId('compare-criterion')).toHaveText('수행 방법론');
      await page.mouse.move(5, 5); // 항목을 벗어나면 닫힌다.
      await expect(panel).toHaveCount(0);
      await page.getByRole('button', { name: '기술 적용 방안 업체별 제안서 요약 보기' }).click(); // ⓘ 클릭은 고정
      await page.mouse.move(5, 5);
      await expect(panel).toBeVisible();
      await expect(page.getByTestId('compare-criterion')).toHaveText('기술 적용 방안');
      await page.getByRole('button', { name: '비교 패널 닫기' }).click();
      await expect(panel).toHaveCount(0);
      await expect(inputs.first()).toHaveValue('5');
    }
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
  await loginAsAdmin(page);
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

  // 생년월일 미등록 위원: APP_ENV=ci에서는 마스터 번호로도 들어올 수 없다.
  const blockedProject = await (await api.post('/api/v1/projects', { data: { name: 'E2E 미등록 위원', department: '검증팀' } })).json();
  const unregistered = await (await api.post('/api/v1/committee/candidates', {
    data: { name: 'E2E 미등록위원', organization: '가상기관', specialty: '보안' },
  })).json();
  expect((await api.post(`/api/v1/projects/${blockedProject.id}/committee/draw`, {
    data: { candidate_ids: [unregistered.id], seats: 1, reserves: 0 },
  })).status()).toBe(201);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/evaluator?project=${blockedProject.id}&candidate=${unregistered.id}`);
  await expect(page.getByRole('heading', { name: '평가위원 본인확인' })).toBeVisible();
  await expect(page.getByText(LOCAL_MASTER_CODE, { exact: false })).toHaveCount(0);
  await page.getByLabel('생년월일 6자리').fill(LOCAL_MASTER_CODE);
  await page.getByLabel('보안 및 청렴 서약', { exact: false }).check();
  await page.getByRole('button', { name: '평가 시작하기' }).click();
  await expect(page.getByRole('alert')).toContainText('등록된 생년월일이 없어');
  await expect(page.getByRole('heading', { name: '평가표 작성' })).toHaveCount(0);
});
