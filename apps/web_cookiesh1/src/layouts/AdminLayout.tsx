import { NavLink, Outlet, useMatch, useNavigate } from 'react-router';
import { useSession } from '../lib/session';
import { projectPath, STEPS } from '../pages/admin/common';
import { ProjectContext, useProject, useProjectLoader } from '../pages/admin/ProjectContext';

export function AdminLayout() {
  const { session, logout } = useSession();
  const navigate = useNavigate();
  const pid = useMatch('/admin/projects/:projectId/*')?.params.projectId;
  // 사업 화면의 데이터는 여기서 한 번만 불러와 사이드바와 본문이 함께 씁니다.
  const project = useProjectLoader(pid);
  return <ProjectContext.Provider value={project}>
    <div className="admin-shell">
      <a className="skip-link" href="#main">본문 바로가기</a>
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark" aria-hidden="true">심</span><div><strong>심사임당</strong><small>공공 제안평가 지원</small></div></div>
        <nav aria-label="관리자 메뉴">
          <small className="nav-group">업무</small>
          <NavLink to="/admin" end>대시보드</NavLink>
          <NavLink to="/admin/projects" end>사업 관리</NavLink>
          {pid && <ProjectSubnav />}
          <NavLink to="/admin/evaluators">평가위원 후보</NavLink>
        </nav>
        <div className="principle"><strong>판단은 사람이 해요</strong><p>AI는 근거를 찾아 줄 뿐이에요.</p></div>
        <div className="user-card">
          <div><strong>{session?.name}</strong><small>부서 관리자(간사)</small></div>
          <button className="btn ghost-dark sm" onClick={() => { logout(); navigate('/login', { replace: true }); }}>로그아웃</button>
        </div>
      </aside>
      <main id="main" className="admin-main"><Outlet /></main>
    </div>
  </ProjectContext.Provider>;
}

/** 사업 안에 있을 때 "사업 관리" 아래에 펼쳐지는 7단계. 완료 ✓ · 지금 할 단계 ● · 이후는 번호만 옅게. */
function ProjectSubnav() {
  const { pid = '', data } = useProject();
  if (!data) return null;
  const { summary, steps, vendors } = data;
  return <div className="subnav-project" role="group" aria-label="사업 단계">
    <NavLink to={projectPath(pid)} end className="subnav-name" title={summary.project.name}>{summary.project.name}</NavLink>
    {STEPS.map((s, i) => {
      const done = steps.done[s.key], now = steps.current === s.key;
      return <NavLink key={s.key} to={projectPath(pid, s.key)} className={now ? 'is-now' : done ? 'is-done' : ''}>
        <span className="sub-no" aria-hidden="true">{i + 1}</span>
        <span className="sub-label">{s.label}{s.key === 'proposals' && vendors.length > 0 && <small> {steps.proposalsDone.length}/{vendors.length}</small>}</span>
        {done ? <span className="sub-mark done" role="img" aria-label="완료">✓</span> : now ? <span className="sub-mark next" role="img" aria-label="지금 할 단계">●</span> : null}
      </NavLink>;
    })}
  </div>;
}

