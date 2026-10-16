import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers';

test('위원 등록 → 추첨 → 평가 → 잠금 → 취합이 화면에서 연결된다', async ({ page }) => {
  await loginAsAdmin(page);
  await page.getByLabel('사업명', { exact: true }).fill('브라우저 통합 사업');
  await page.getByLabel('담당 부서').fill('통합검증팀');
  await page.getByRole('button', { name: '사업 등록', exact: true }).click();
  await expect(page.getByRole('heading', { name: '브라우저 통합 사업' })).toBeVisible();
  await page.getByRole('button', { name: '위원 등록·추첨으로 이동 →' }).click();
  for (let i = 1; i <= 3; i++) {
    await page.getByLabel('이름', { exact: true }).fill(`통합위원 ${i}`);
    await page.getByLabel('소속', { exact: true }).fill('가상기관');
    await page.getByLabel('전문분야', { exact: true }).fill('정보시스템');
    await page.getByRole('button', { name: '후보 등록', exact: true }).click();
    await expect(page.getByRole('cell', { name: `통합위원 ${i}`, exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: '활성 후보 모두 선택' }).click();
  await page.getByLabel('후보 자격·이해관계를 검토했습니다.', { exact: false }).check();
  await page.getByRole('button', { name: '위원 추첨 확정' }).click();
  await expect(page.getByRole('heading', { name: '추첨 결과 확정' })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'artifacts/committee.png', fullPage: true });
  await page.getByRole('button', { name: '평가·제출·취합', exact: true }).click();
  const selector = page.getByLabel('개발용 평가위원 전환');
  await expect(selector.locator('option')).toHaveCount(2);
  const ids = await selector.locator('option').evaluateAll(options => options.map(o => (o as HTMLOptionElement).value));
  for (const id of ids) {
    await selector.selectOption(id);
    const inputs = page.locator('input.score');
    await expect(inputs).toHaveCount(21);
    await expect(inputs.first()).toBeEnabled();
    for (let i = 0; i < 21; i++) await inputs.nth(i).fill('5');
    await expect(page.getByRole('button', { name: '최종 제출', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: '평가표 저장', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('저장되었습니다.');
    await page.getByLabel('본인의 판단으로 작성했으며', { exact: false }).check();
    await page.getByRole('button', { name: '최종 제출', exact: true }).click();
    await expect(page.getByText('제출 완료 · 수정 잠금', { exact: true })).toBeVisible();
    await expect(inputs.first()).toBeDisabled();
  }
  await expect(page.getByTestId('submission-count')).toHaveText('2 / 2');
  await expect(page.getByRole('cell', { name: '35.00', exact: true })).toHaveCount(3);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'artifacts/evaluations.png', fullPage: true });
  await page.reload();
  // 새로고침 뒤 앱은 이름순 첫 사업을 고르므로, 다른 E2E가 만든 사업과 섞이지 않게 이 사업을 다시 고른다.
  await page.locator('select').first().selectOption({ label: '브라우저 통합 사업' });
  await page.getByRole('button', { name: '평가·제출·취합', exact: true }).click();
  await expect(page.getByTestId('submission-count')).toHaveText('2 / 2');
  await expect(page.locator('input.score').first()).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'artifacts/mobile.png', fullPage: true });
});
