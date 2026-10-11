import { createContext, useContext, useState, type ReactNode } from 'react';
import { setToken } from '../api/client';
import type { Session } from '../api/contract';
import { clearUserDrafts } from './draft';

// 세션은 탭 단위(sessionStorage)로 둡니다. 탭을 닫으면 로그아웃됩니다.
const KEY = 'simsa-session';

function readSession(): Session | null {
  try { return JSON.parse(sessionStorage.getItem(KEY) ?? 'null'); } catch { return null; }
}

interface Ctx { session: Session | null; loggedOut: boolean; login: (s: Session) => void; logout: () => void }
const SessionContext = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => {
    const s = readSession();
    setToken(s?.token ?? '');
    return s;
  });
  const [loggedOut, setLoggedOut] = useState(false);
  function login(s: Session) {
    sessionStorage.setItem(KEY, JSON.stringify(s)); setToken(s.token); setSession(s); setLoggedOut(false);
  }
  function logout() {
    if (session) clearUserDrafts(session.user_id);
    sessionStorage.removeItem(KEY); setToken(''); setSession(null); setLoggedOut(true);
  }
  return <SessionContext.Provider value={{ session, loggedOut, login, logout }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('SessionProvider가 필요합니다.');
  return ctx;
}
