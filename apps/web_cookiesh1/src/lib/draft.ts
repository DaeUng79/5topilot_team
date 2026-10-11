// 평가 입력 임시보관(EVAL-04). 점수·의견만 저장하고 이름·연락처는 넣지 않습니다.
// 서버 저장 성공·제출·로그아웃 시 삭제, 앱 시작 시 24시간 지난 항목 일괄 삭제.
import type { Score } from '../api/client';

export interface Draft { base_version: number; scores: Score[]; opinion: string; saved_at: string }

const PREFIX = 'simsa-draft:';
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const keyOf = (projectId: string, userId: string) => `${PREFIX}${projectId}:${userId}`;

export function readDraft(projectId: string, userId: string, now = Date.now()): Draft | null {
  try {
    const draft = JSON.parse(localStorage.getItem(keyOf(projectId, userId)) ?? 'null') as Draft | null;
    if (!draft) return null;
    if (now - Date.parse(draft.saved_at) > DRAFT_TTL_MS) { clearDraft(projectId, userId); return null; }
    return draft;
  } catch { clearDraft(projectId, userId); return null; }
}

export function writeDraft(projectId: string, userId: string, draft: Omit<Draft, 'saved_at'>, now = Date.now()) {
  localStorage.setItem(keyOf(projectId, userId), JSON.stringify({ ...draft, saved_at: new Date(now).toISOString() }));
}

export function clearDraft(projectId: string, userId: string) { localStorage.removeItem(keyOf(projectId, userId)); }

function draftKeys() {
  return Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter((k): k is string => !!k?.startsWith(PREFIX));
}

/** 로그아웃 시 해당 사용자의 임시보관 전부 삭제 */
export function clearUserDrafts(userId: string) {
  draftKeys().filter(k => k.endsWith(`:${userId}`)).forEach(k => localStorage.removeItem(k));
}

/** 앱 시작 시 만료 항목 정리 */
export function purgeExpiredDrafts(now = Date.now()) {
  for (const k of draftKeys()) {
    try {
      const d = JSON.parse(localStorage.getItem(k) ?? 'null') as Draft | null;
      if (!d || now - Date.parse(d.saved_at) > DRAFT_TTL_MS) localStorage.removeItem(k);
    } catch { localStorage.removeItem(k); }
  }
}
