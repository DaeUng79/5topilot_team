import createClient from 'openapi-fetch';
import type { paths, components } from './schema';
import { mockFetch } from './mock';

export type Project = components['schemas']['ProjectRead'];
export type Candidate = components['schemas']['CandidateRead'];
export type Draw = components['schemas']['DrawRead'];
export type Sheet = components['schemas']['SheetRead'];
export type Results = components['schemas']['ResultsRead'];
export type Score = components['schemas']['ScoreEntry'];

// Local demonstration identities only; replace when the backend gains real authentication.
export const useMock = import.meta.env.VITE_USE_MOCK === '1';
const fetchOption = useMock ? { fetch: mockFetch } : {};

export const api = createClient<paths>({ ...fetchOption, headers: { Authorization: 'Bearer local-admin' } });
export function evaluatorApi(id: string) {
  return createClient<paths>({ ...fetchOption, headers: { Authorization: `Bearer local-evaluator:${id}` } });
}

export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (!result.response.ok || result.data === undefined) {
    const err = result.error as { detail?: unknown } | undefined;
    throw new Error(typeof err?.detail === 'string' ? err.detail : `요청 실패 (${result.response.status})`);
  }
  return result.data;
}
