import { createContext, useContext, useEffect, useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router';
import { useSession } from '../lib/session';

const TitleCtx = createContext<(name: string | null) => void>(() => {});
/** 사업 화면이 열려 있는 동안 헤더에 사업명을 보여 줘요. */
export function useHeaderTitle(name: string | null) {
  const set = useContext(TitleCtx);
  useEffect(() => { set(name); return () => set(null); }, [name, set]);
}

export function EvalLayout() {
  const { session, logout } = useSession();
  const navigate = useNavigate();
  const [title, setTitle] = useState<string | null>(null);
  return <div className="eval-shell">
    <a className="skip-link" href="#main">본문 바로가기</a>
    <header className="eval-header">
      <Link to="/eval" className="brand"><span className="brand-mark" aria-hidden="true">심</span><strong>심사임당</strong></Link>
      {title && <span className="eval-role eval-title" title={title}>{title}</span>}
      <div className="eval-user"><span>{session?.name} 위원님</span>
        <button className="btn sm ghost" onClick={() => { logout(); navigate('/login', { replace: true }); }}>로그아웃</button></div>
    </header>
    <main id="main" className="eval-main"><TitleCtx.Provider value={setTitle}><Outlet /></TitleCtx.Provider></main>
  </div>;
}
