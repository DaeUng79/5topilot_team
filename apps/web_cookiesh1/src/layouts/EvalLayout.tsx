import { Link, Outlet, useNavigate } from 'react-router';
import { useSession } from '../lib/session';

export function EvalLayout() {
  const { session, logout } = useSession();
  const navigate = useNavigate();
  return <div className="eval-shell">
    <a className="skip-link" href="#main">본문 바로가기</a>
    <header className="eval-header">
      <Link to="/eval" className="brand"><span className="brand-mark" aria-hidden="true">심</span><strong>심사임당</strong></Link>
      <span className="eval-role">평가위원</span>
      <div className="eval-user"><span>{session?.name} 위원님</span>
        <button className="btn sm" onClick={() => { logout(); navigate('/login', { replace: true }); }}>로그아웃</button></div>
    </header>
    <main id="main" className="eval-main"><Outlet /></main>
  </div>;
}
