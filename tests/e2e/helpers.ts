import { expect, type Page } from '@playwright/test';

export const API = 'http://127.0.0.1:8000'; // 경로는 /api/v1/... 로 적는다(baseURL에 절대 경로를 합치면 prefix가 사라진다).

// 관리자 화면 E2E 공통 로그인. scripts/e2e-api.mjs는 DEMO_AUTH=true라 로컬 시연용 계정이 열려 있다.
export async function loginAsAdmin(page: Page) {
  await page.goto('/');
  await page.getByLabel('아이디').fill('admin');
  await page.getByLabel('비밀번호').fill('admin');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible();
}
