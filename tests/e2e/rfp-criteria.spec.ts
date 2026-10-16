import { test, expect, request } from '@playwright/test';
import { API, loginAsAdmin } from './helpers';

// 평가 설정 > [제안요청서 반영]: 빈 평가표·총배점으로 사업을 등록하고, 파싱 결과(E2E에는 문서 저장소가 없어
// 테스트용 예시 자료)를 미리보기에서 비교·수정한 뒤 반영한다. 재반영해도 중복이 없고, 평가표가 저장되면 잠긴다.
test('빈 평가표 사업에 제안요청서 파싱 결과를 검토·수정해 반영하고 재반영해도 중복되지 않는다', async ({ page }) => {
  await loginAsAdmin(page);
  await page.getByLabel('사업명', { exact: true }).fill('E2E 제안요청서 사업');
  await page.getByLabel('담당 부서').fill('검증팀');
  await page.getByLabel('기술평가 총배점', { exact: true }).fill('120');
  await page.getByLabel('평가항목 시작').selectOption('empty');
  await page.getByRole('button', { name: '사업 등록', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'E2E 제안요청서 사업' })).toBeVisible();
  await expect(page.getByText('기술평가 0점 / 총배점 120점', { exact: false })).toBeVisible();
  await page.getByRole('tab', { name: '평가 설정' }).click();
  const rows = page.getByTestId('criteria-table').locator('tbody tr');
  await expect(page.getByTestId('total-score')).toHaveText('0점');
  await expect(page.getByTestId('total-warning')).toContainText('120점');
  await expect(page.getByText('평가항목이 없습니다', { exact: false })).toBeVisible();

  // 파싱 저장소가 없는 환경: 안내 뒤 테스트용 예시 자료로 미리보기. 곧바로 반영되지 않는다.
  await page.getByRole('button', { name: '제안요청서 반영' }).click();
  await expect(page.getByTestId('rfp-unavailable')).toBeVisible();
  await expect(page.getByTestId('total-score')).toHaveText('0점');
  await page.getByRole('button', { name: '테스트용 예시 자료로 미리보기' }).click();
  const preview = page.getByTestId('rfp-preview');
  await expect(preview).toBeVisible();
  await expect(preview.getByTestId('rfp-notice')).toContainText('테스트용 예시 자료');
  await expect(preview.locator('.rfp-table').first().locator('tbody tr')).toHaveCount(5);
  await expect(preview.getByTestId('rfp-summary')).toContainText('신규 5');
  await expect(preview.getByRole('checkbox', { name: '사업 이해도 반영' })).toBeChecked();
  await expect(preview.getByRole('checkbox', { name: '데이터 이관 검증 계획 반영' })).not.toBeChecked(); // AI 보완 제안은 기본 제외
  await expect(preview.getByTestId('rfp-after-total')).toContainText('100점 / 총배점 120점');
  await expect(preview.getByTestId('rfp-total-warning')).toBeVisible();
  // 담당자 수정: 유지보수·교육 25 → 45로 맞추면 경고가 사라진다.
  await preview.getByLabel('sample-rfp-document:R05 배점').fill('45');
  await expect(preview.getByTestId('rfp-after-total')).toContainText('120점 / 총배점 120점');
  await expect(preview.getByTestId('rfp-total-warning')).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/rfp-preview.png', fullPage: true });
  await preview.getByRole('button', { name: /검토 후 반영/ }).click();
  await expect(preview).toHaveCount(0);
  await expect(rows).toHaveCount(5);
  await expect(page.getByTestId('total-score')).toHaveText('120점');
  await expect(page.getByTestId('total-warning')).toHaveCount(0);
  await expect(rows.first()).toContainText('사업 이해도');
  await expect(rows.first()).toContainText('제안요청서');
  await expect(rows.first()).toContainText('전략 및 방법론');
  await expect(rows.nth(4)).toContainText('45점');
  await page.screenshot({ path: 'artifacts/rfp-applied.png', fullPage: true });

  // 같은 결과를 다시 열면 짝이 맞아 신규 0·배점 변경 1(R05 45 vs 25)·동일 4. 취소하면 그대로.
  await page.getByRole('button', { name: '제안요청서 반영' }).click();
  await page.getByRole('button', { name: '테스트용 예시 자료로 미리보기' }).click();
  await expect(preview.getByTestId('rfp-summary')).toContainText('신규 0');
  await expect(preview.getByTestId('rfp-summary')).toContainText('배점 변경 1');
  await expect(preview.getByTestId('rfp-summary')).toContainText('동일 4');
  await preview.getByRole('button', { name: '취소' }).click();
  await expect(preview).toHaveCount(0);
  await expect(rows).toHaveCount(5);

  // 직접 입력 항목을 더한 뒤 재반영: 중복 없이 6개, 직접 입력 항목은 삭제 후보로만 표시되고 기본 유지.
  await page.getByRole('button', { name: '+ 평가항목 추가' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('평가항목명').fill('가격 적정성');
  await dialog.getByLabel('배점').fill('10');
  await dialog.getByRole('button', { name: '저장' }).click();
  await expect(rows).toHaveCount(6);
  await page.getByRole('button', { name: '제안요청서 반영' }).click();
  await page.getByRole('button', { name: '테스트용 예시 자료로 미리보기' }).click();
  await expect(preview.getByRole('checkbox', { name: '가격 적정성 삭제' })).not.toBeChecked();
  await preview.getByRole('button', { name: /검토 후 반영/ }).click();
  await expect(preview).toHaveCount(0);
  await expect(rows).toHaveCount(6);
  await expect(rows.nth(5)).toContainText('가격 적정성');
  await expect(page.getByTestId('total-score')).toHaveText('110점'); // R05가 원문 배점 25로 돌아가 100 + 10

  // 위원 추첨(간사 API) 뒤 평가표는 6항목 × 3업체 = 18칸. 합계(110)가 총배점(120)과 달라 저장이 거절된다.
  const api = await request.newContext({ baseURL: API, extraHTTPHeaders: { Authorization: 'Bearer local-admin' } });
  const projects: { id: string; name: string }[] = await (await api.get('/api/v1/projects')).json();
  const project = projects.find(p => p.name === 'E2E 제안요청서 사업')!;
  const candidateIds: string[] = [];
  for (let i = 1; i <= 2; i++) {
    const response = await api.post('/api/v1/committee/candidates', {
      data: { name: `반영위원 ${i}`, organization: '가상기관', specialty: '정보시스템' },
    });
    candidateIds.push((await response.json()).id);
  }
  expect((await api.post(`/api/v1/projects/${project.id}/committee/draw`, {
    data: { candidate_ids: candidateIds, seats: 1, reserves: 1 },
  })).status()).toBe(201);
  await page.getByRole('button', { name: '평가·제출·취합', exact: true }).click();
  const inputs = page.locator('input.score');
  await expect(inputs).toHaveCount(18);
  for (let i = 0; i < 18; i++) await inputs.nth(i).fill('1');
  await page.getByRole('button', { name: '평가표 저장', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('120점');

  // 총배점을 110점으로 맞추면 저장되고, 저장 뒤에는 제안요청서 반영·총배점 변경이 잠긴다.
  await page.getByRole('button', { name: '사업 관리', exact: true }).click();
  await page.getByLabel('총배점 변경').fill('110');
  await page.getByRole('button', { name: '총배점 저장' }).click();
  await expect(page.getByTestId('total-warning')).toHaveCount(0);
  await page.getByRole('button', { name: '평가·제출·취합', exact: true }).click();
  for (let i = 0; i < 18; i++) await inputs.nth(i).fill('1');
  await page.getByRole('button', { name: '평가표 저장', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('저장되었습니다.');
  await page.getByRole('button', { name: '사업 관리', exact: true }).click();
  await expect(page.getByRole('button', { name: '제안요청서 반영' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '총배점 저장' })).toBeDisabled();
  await expect(page.getByText('평가표 작성을 시작해', { exact: false }).first()).toBeVisible();
});
