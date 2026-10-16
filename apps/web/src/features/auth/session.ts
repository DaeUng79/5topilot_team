import { setSessionToken, type SessionActor, type SessionRead } from '../../api/client';

// 로그인 세션은 탭 세션(sessionStorage)에만 둔다. 새로고침에는 유지되고 탭을 닫으면 사라진다.
// 평가위원 접근 링크 화면(features/evaluator/EvaluatorApp)은 사업·위원별 키를 따로 쓴다.
const KEY = 'simsa.session';

export type StoredSession = { token: string; expires_at: string; actor: SessionActor };
export const ROLE_LABEL = { admin: '사업관리자', evaluator: '평가위원' } as const;

// 저장된 세션을 읽어 API 클라이언트에 토큰을 넣는다. 만료됐으면 지우고 null.
export function restoreSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as StoredSession;
    if (!saved.token || new Date(saved.expires_at) <= new Date()) { sessionStorage.removeItem(KEY); return null; }
    setSessionToken(saved.token);
    return saved;
  } catch { return null; }
}

export function saveSession(session: SessionRead): StoredSession {
  const stored: StoredSession = { token: session.token, expires_at: session.expires_at, actor: session.actor };
  try { sessionStorage.setItem(KEY, JSON.stringify(stored)); } catch { /* 저장 불가 환경: 이 탭에서만 유지 */ }
  setSessionToken(stored.token);
  return stored;
}

// 로그아웃. 토큰은 서버가 서명한 만료 토큰이라 클라이언트에서 버리면 끝이며 서버 폐기 목록은 없다.
export function clearSession() {
  try { sessionStorage.removeItem(KEY); } catch { /* 무시 */ }
  setSessionToken('');
}
