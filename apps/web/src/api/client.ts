import createClient from 'openapi-fetch';
import type { paths, components } from './schema';

export type Project = components['schemas']['ProjectRead'];
export type Candidate = components['schemas']['CandidateRead'];
export type Draw = components['schemas']['DrawRead'];
export type Sheet = components['schemas']['SheetRead'];
export type Results = components['schemas']['ResultsRead'];
export type Score = components['schemas']['ScoreEntry'];
export type ResultsSummary = components['schemas']['ResultsSummary'];
export type Confirmation = components['schemas']['ConfirmationRead'];
export type SessionRead = components['schemas']['SessionRead'];
export type AccessContext = components['schemas']['AccessContextRead'];

// Local demonstration identities only; replace when the backend gains real authentication.
export const api = createClient<paths>({ headers: { Authorization: 'Bearer local-admin' } });
export function evaluatorApi(id: string) {
  return createClient<paths>({ headers: { Authorization: `Bearer local-evaluator:${id}` } });
}
// 본인확인 뒤 서버가 발급한 세션 토큰으로 호출한다. 토큰은 사업 하나에만 유효하다.
export function sessionApi(token: string) {
  return createClient<paths>({ headers: { Authorization: `Bearer ${token}` } });
}
// 본인확인 전 호출(접근 안내·인증번호 요청·검증). 인증 헤더 없음.
export const publicApi = createClient<paths>();

export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (!result.response.ok || result.data === undefined) {
    const err = result.error as { detail?: unknown } | undefined;
    throw new Error(typeof err?.detail === 'string' ? err.detail : `요청 실패 (${result.response.status})`);
  }
  return result.data;
}
