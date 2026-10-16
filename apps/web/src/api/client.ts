import createClient from 'openapi-fetch';
import type { paths, components } from './schema';

export type Project = components['schemas']['ProjectRead'];
export type Vendor = components['schemas']['Vendor'];
export type ProjectSetup = components['schemas']['ProjectSetupRead'];
export type CriterionDraft = components['schemas']['CriterionDraft'];
export type VendorDraft = components['schemas']['VendorDraft'];
export type RfpCriteria = components['schemas']['RfpCriteriaRead'];
export type Candidate = components['schemas']['CandidateRead'];
export type Draw = components['schemas']['DrawRead'];
export type ChairRead = components['schemas']['ChairRead'];
export type Sheet = components['schemas']['SheetRead'];
export type Results = components['schemas']['ResultsRead'];
export type Score = components['schemas']['ScoreEntry'];
export type ResultsSummary = components['schemas']['ResultsSummary'];
export type Confirmation = components['schemas']['ConfirmationRead'];
export type SessionRead = components['schemas']['SessionRead'];
export type SessionActor = components['schemas']['SessionActor'];
export type AccessContext = components['schemas']['AccessContextRead'];

// 공통 화면(App)의 호출. 로그인 뒤 저장된 세션 토큰(features/auth/session.ts → setSessionToken)을 모든 요청에
// 붙인다. 토큰이 없으면 Authorization 없이 보내고 서버가 401/503으로 답한다. 권한 판정은 서버가 한다.
let sessionToken = '';
export function setSessionToken(token: string) { sessionToken = token; }
export const api = createClient<paths>();
api.use({
  onRequest({ request }) {
    if (sessionToken) request.headers.set('Authorization', `Bearer ${sessionToken}`);
    return request;
  },
});
// 관리자 평가 화면의 '개발용 평가위원 전환'에만 쓰는 로컬 데모 토큰. 실제 인증이 아니다.
export function evaluatorApi(id: string) {
  return createClient<paths>({ headers: { Authorization: `Bearer local-evaluator:${id}` } });
}
// 본인확인 뒤 서버가 발급한 세션 토큰으로 호출한다. 토큰은 사업 하나에만 유효하다.
export function sessionApi(token: string) {
  return createClient<paths>({ headers: { Authorization: `Bearer ${token}` } });
}
// 본인확인 전 호출(접근 안내·생년월일 검증). 인증 헤더 없음.
export const publicApi = createClient<paths>();

export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (!result.response.ok || result.data === undefined) {
    const err = result.error as { detail?: unknown } | undefined;
    throw new Error(typeof err?.detail === 'string' ? err.detail : `요청 실패 (${result.response.status})`);
  }
  return result.data;
}
