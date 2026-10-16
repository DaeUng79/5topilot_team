import { test, expect, request } from '@playwright/test';
import { API, loginAsAdmin } from './helpers';

// 사업 상세 > 평가 설정: 평가항목·업체 등록/수정/순서/삭제가 저장되고 새로고침 뒤에도 남으며,
// 평가표가 그 설정(항목 수 × 업체 수)으로 자동 구성된다. 배점 합계는 100점이어야 평가를 시작할 수 있다.
// 시작용 샘플(demo-project, seed)은 바꾸지 않고 그대로 보이는지와 예시 요약 패널만 확인한다.

test('평가 설정에서 등록한 평가항목·업체로 평가표가 자동 구성되고 평가 시작 뒤 잠긴다', async ({ page }) => {
  page.on('dialog', dialog => void dialog.accept()); // 삭제 확인창
  await loginAsAdmin(page);
  await page.getByLabel('사업명', { exact: true }).fill('E2E 평가 설정 사업');
  await page.getByLabel('담당 부서').fill('검증팀');
  await page.getByRole('button', { name: '사업 등록', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'E2E 평가 설정 사업' })).toBeVisible();
  await page.getByRole('tab', { name: '평가 설정' }).click();

  // 시작용 기본값: 7항목 합계 100점, 업체 3개(A사·B사·C사)
  const criteriaRows = page.getByTestId('criteria-table').locator('tbody tr');
  const vendorRows = page.getByTestId('vendor-table').locator('tbody tr');
  await expect(criteriaRows).toHaveCount(7);
  await expect(vendorRows).toHaveCount(3);
  await expect(page.getByTestId('total-score')).toHaveText('100점');
  await expect(page.getByTestId('total-warning')).toHaveCount(0);
  await expect(vendorRows.first()).toContainText('A사');

  // 평가항목: 2개 삭제 → 5개(75점, 경고), 모달로 배점 수정(95점), 순서 변경, 모달로 추가 → 6개(100점)
  for (const name of ['투입 인력', '유지보수·교육']) await page.getByRole('button', { name: `${name} 삭제` }).click();
  await expect(criteriaRows).toHaveCount(5);
  await expect(page.getByTestId('total-score')).toHaveText('75점');
  await expect(page.getByTestId('total-warning')).toContainText('총배점 100점');
  const dialog = page.getByRole('dialog');
  await page.getByRole('button', { name: '일정 관리 수정' }).click();
  await expect(dialog.getByRole('heading', { name: '평가항목 수정' })).toBeVisible();
  await expect(dialog.getByLabel('평가항목명')).toHaveValue('일정 관리');
  await dialog.getByLabel('배점').fill('30');
  await dialog.getByRole('button', { name: '저장' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('total-score')).toHaveText('95점');
  await page.getByRole('button', { name: '일정 관리 위로' }).click();
  await expect(criteriaRows.nth(3)).toContainText('일정 관리');
  await expect(criteriaRows.nth(4)).toContainText('보안 대책');
  await page.getByRole('button', { name: '+ 평가항목 추가' }).click();
  await expect(dialog.getByRole('heading', { name: '평가항목 추가' })).toBeVisible();
  await dialog.getByLabel('평가항목명').fill('가격 적정성');
  await dialog.getByLabel('배점').fill('5');
  await dialog.getByRole('button', { name: '저장' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(criteriaRows).toHaveCount(6);
  await expect(page.getByTestId('total-score')).toHaveText('100점');
  await expect(page.getByTestId('total-warning')).toHaveCount(0);
  // 중복 이름은 서버가 거절하고 모달 안에 오류가 보인다.
  await page.getByRole('button', { name: '+ 평가항목 추가' }).click();
  await dialog.getByLabel('평가항목명').fill('가격 적정성');
  await dialog.getByLabel('배점').fill('5');
  await dialog.getByRole('button', { name: '저장' }).click();
  await expect(dialog.getByRole('alert')).toContainText('평가항목명이 중복됩니다.');
  await dialog.getByRole('button', { name: '취소' }).click();
  await expect(criteriaRows).toHaveCount(6);

  // 업체: 이름 수정, 추가 → 4개, 순서 변경
  await page.getByRole('button', { name: 'A사 수정' }).click();
  await expect(dialog.getByRole('heading', { name: '업체 수정' })).toBeVisible();
  await dialog.getByLabel('업체명').fill('한빛소프트(주)');
  await dialog.getByRole('button', { name: '저장' }).click();
  await expect(vendorRows.first()).toContainText('한빛소프트(주)');
  await page.getByRole('button', { name: '+ 업체 추가' }).click();
  await dialog.getByLabel('업체명').fill('누리정보기술');
  await dialog.getByRole('button', { name: '저장' }).click();
  await expect(vendorRows).toHaveCount(4);
  await page.getByRole('button', { name: '누리정보기술 위로' }).click();
  await expect(vendorRows.nth(2)).toContainText('누리정보기술');
  await expect(vendorRows.nth(3)).toContainText('C사');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'artifacts/evaluation-setup.png', fullPage: true });

  // 새로고침 뒤에도 로그인과 등록 정보가 유지된다.
  await page.reload();
  await page.locator('select').first().selectOption({ label: 'E2E 평가 설정 사업' });
  await page.getByRole('tab', { name: '평가 설정' }).click();
  await expect(criteriaRows).toHaveCount(6);
  await expect(vendorRows).toHaveCount(4);
  await expect(page.getByTestId('total-score')).toHaveText('100점');
  await expect(criteriaRows.nth(5)).toContainText('가격 적정성');

  // 위원 추첨(간사 API) 뒤 평가표가 6항목 × 4업체 = 24칸으로 구성되고, 비교 패널은 업체 4개 카드에 요약 없음 문구를 보인다.
  const api = await request.newContext({ baseURL: API, extraHTTPHeaders: { Authorization: 'Bearer local-admin' } });
  const projects: { id: string; name: string }[] = await (await api.get('/api/v1/projects')).json();
  const project = projects.find(p => p.name === 'E2E 평가 설정 사업')!;
  const candidateIds: string[] = [];
  for (let i = 1; i <= 2; i++) {
    const response = await api.post('/api/v1/committee/candidates', {
      data: { name: `설정위원 ${i}`, organization: '가상기관', specialty: '정보시스템' },
    });
    expect(response.status()).toBe(201);
    candidateIds.push((await response.json()).id);
  }
  expect((await api.post(`/api/v1/projects/${project.id}/committee/draw`, {
    data: { candidate_ids: candidateIds, seats: 1, reserves: 1 },
  })).status()).toBe(201);
  await page.getByRole('button', { name: '평가·제출·취합', exact: true }).click();
  const inputs = page.locator('input.score');
  await expect(inputs).toHaveCount(24);
  await expect(page.getByRole('columnheader', { name: '한빛소프트(주)' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: '누리정보기술' })).toBeVisible();
  await inputs.first().fill('7');
  const panel = page.getByTestId('proposal-compare');
  await page.locator('.criterion-label', { hasText: '가격 적정성' }).hover();
  await expect(panel).toBeVisible();
  await expect(panel.locator('.vendor-card')).toHaveCount(4);
  await expect(panel.getByText('제안서 요약 정보가 없습니다.')).toHaveCount(4);
  await expect(panel.getByText('예시 자료', { exact: false })).toHaveCount(0);
  await expect(inputs.first()).toHaveValue('7');
  await page.mouse.move(5, 5);
  await expect(panel).toHaveCount(0);

  // 평가표가 저장되면 평가 설정이 잠긴다.
  for (let i = 0; i < 24; i++) await inputs.nth(i).fill('5');
  await page.getByRole('button', { name: '평가표 저장', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('저장되었습니다.');
  await page.getByRole('button', { name: '사업 관리', exact: true }).click();
  await expect(page.getByText('평가표 작성을 시작해', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: '+ 평가항목 추가' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '+ 업체 추가' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '가격 적정성 삭제' })).toBeDisabled();
  await expect(criteriaRows).toHaveCount(6);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'artifacts/evaluation-setup-locked.png', fullPage: true });
});

test('시작용 샘플 사업(demo-project)의 평가항목·업체는 그대로이고 예시 요약 패널이 보인다', async ({ page }) => {
  const api = await request.newContext({ baseURL: API, extraHTTPHeaders: { Authorization: 'Bearer local-admin' } });
  const response = await api.get('/api/v1/projects/demo-project/setup');
  expect(response.status()).toBe(200);
  const setup = await response.json();
  expect(setup.criteria.map((c: { name: string }) => c.name)).toEqual(
    ['사업 이해도', '수행 방법론', '기술 적용 방안', '보안 대책', '일정 관리', '투입 인력', '유지보수·교육']);
  expect(setup.vendors.map((v: { name: string }) => v.name)).toEqual(['A사', 'B사', 'C사']);
  expect(setup.total_score).toBe(100);

  // 샘플 사업도 같은 화면을 쓴다. 추첨만 API로 해서 채점표를 띄우고 예시 요약(예시 표시)을 확인한다.
  expect((await api.post('/api/v1/projects/demo-project/committee/draw', {
    data: { candidate_ids: ['demo-evaluator-1', 'demo-evaluator-2', 'demo-evaluator-3'], seats: 2, reserves: 1 },
  })).status()).toBe(201);
  await loginAsAdmin(page);
  await page.locator('select').first().selectOption('demo-project');
  await page.getByRole('tab', { name: '평가 설정' }).click();
  await expect(page.getByTestId('criteria-table').locator('tbody tr')).toHaveCount(7);
  await expect(page.getByTestId('vendor-table').locator('tbody tr')).toHaveCount(3);
  await expect(page.getByTestId('total-score')).toHaveText('100점');
  await page.getByRole('button', { name: '평가·제출·취합', exact: true }).click();
  await expect(page.locator('input.score')).toHaveCount(21);
  const panel = page.getByTestId('proposal-compare');
  await page.locator('.criterion-label', { hasText: '사업 이해도' }).hover();
  await expect(panel).toBeVisible();
  await expect(panel.locator('.vendor-card')).toHaveCount(3);
  await expect(panel.getByText('예시 자료', { exact: false }).first()).toBeVisible();
  await expect(panel.getByText('제안서 요약 정보가 없습니다.')).toHaveCount(0);
});
