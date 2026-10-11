import { NavLink, Outlet, useNavigate } from 'react-router';
import { useSession } from '../lib/session';

export function AdminLayout() {
  const { session, logout } = useSession();
  const navigate = useNavigate();
  return <div className="admin-shell">
    <a className="skip-link" href="#main">본문 바로가기</a>
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark" aria-hidden="true">심</span><div><strong>심사임당</strong><small>공공 제안평가 지원</small></div></div>
      <nav aria-label="관리자 메뉴">
        <small className="nav-group">업무</small>
        <NavLink to="/admin" end>대시보드</NavLink>
        <NavLink to="/admin/projects">사업 관리</NavLink>
        <NavLink to="/admin/evaluators">평가위원 관리</NavLink>
      </nav>
      <div className="principle"><strong>판단은 사람이 합니다</strong><p>AI는 문서의 근거를 찾고 정리하는 역할만 맡습니다.</p></div>
      <div className="user-card">
        <div><strong>{session?.name}</strong><small>부서 관리자(간사)</small></div>
        <button className="btn ghost-dark sm" onClick={() => { logout(); navigate('/login', { replace: true }); }}>로그아웃</button>
      </div>
    </aside>
    <main id="main" className="admin-main"><Outlet /></main>
  </div>;
}
