import createClient from 'openapi-fetch';
import type { paths, components } from './schema';

export type Project = components['schemas']['ProjectRead'];
export type Candidate = components['schemas']['CandidateRead'];
export type Draw = components['schemas']['DrawRead'];
export type Sheet = components['schemas']['SheetRead'];
export type Results = components['schemas']['ResultsRead'];
export type Score = components['schemas']['ScoreEntry'];

export const useMock = import.meta.env.VITE_USE_MOCK === '1';

// mock 코드는 VITE_USE_MOCK=1 빌드에서만 번들에 포함됩니다(조건이 빌드 시 상수로 치환됨).
const transport: (req: Request) => Promise<Response> = import.meta.env.VITE_USE_MOCK === '1'
  ? req => import('./mock').then(m => m.mockFetch(req))
  : req => fetch(req);

let token = '';
export function setToken(next: string) { token = next; }

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
  /** 0 = 서버에 닿지 못함(네트워크 끊김 등) */
  get offline() { return this.status === 0; }
}

async function send(req: Request): Promise<Response> {
  if (token) req.headers.set('Authorization', `Bearer ${token}`);
  try { return await transport(req); }
  catch { throw new ApiError(0, '서버에 연결하지 못했습니다.'); }
}

export const api = createClient<paths>({ fetch: send });

function detailOf(body: unknown, status: number) {
  const detail = (body as { detail?: unknown } | undefined)?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map(d => (d as { msg?: string }).msg).filter(Boolean).join(', ') || `입력값 오류 (${status})`;
  return `요청 실패 (${status})`;
}

/** openapi-fetch 결과를 데이터 또는 ApiError로 바꿉니다. */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (!result.response.ok || result.data === undefined) throw new ApiError(result.response.status, detailOf(result.error, result.response.status));
  return result.data;
}

/** 제안 계약(contract.ts) 경로용. 실제 서버에 없으면 404 ApiError가 납니다. */
export async function request<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<T> {
  const res = await send(new Request(new URL(path, location.origin), {
    method, headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
  const data = await res.json().catch(() => undefined);
  if (!res.ok) throw new ApiError(res.status, detailOf(data, res.status));
  return data as T;
}

/** 오류 매핑표: 상태 코드별 사용자 문구와 다음 행동 */
export function describeError(e: unknown): { title: string; detail: string; action: 'retry' | 'login' | 'reload' | 'none' } {
  const err = e instanceof ApiError ? e : new ApiError(-1, String(e));
  switch (true) {
    case err.status === 0: return { title: '서버에 연결하지 못했어요', detail: '네트워크 연결을 확인하고 다시 시도해 주세요. 입력한 내용은 이 브라우저에 남아 있습니다.', action: 'retry' };
    case err.status === 401: return { title: '로그인이 필요해요', detail: '로그인이 만료되었습니다. 다시 로그인하면 이어서 진행할 수 있습니다.', action: 'login' };
    case err.status === 403: return { title: '접근 권한이 없어요', detail: err.message, action: 'none' };
    case err.status === 404: return { title: '찾을 수 없어요', detail: err.message, action: 'none' };
    case err.status === 409: return { title: '다른 변경과 충돌했어요', detail: err.message, action: 'reload' };
    case err.status === 422: return { title: '입력값을 확인해 주세요', detail: err.message, action: 'none' };
    case err.status >= 500: return { title: '서버 오류가 발생했어요', detail: '잠시 후 다시 시도해 주세요. 문제가 계속되면 간사에게 알려 주세요.', action: 'retry' };
    default: return { title: '요청을 처리하지 못했어요', detail: err.message, action: 'retry' };
  }
}
