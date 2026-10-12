import { Link, NavLink, Outlet, useMatch, useNavigate, useSearchParams } from 'react-router';
import { useSession } from '../lib/session';
import { useLoad } from '../lib/useLoad';
import { request } from '../api/client';
import type { DocumentRead } from '../api/contract';
import { docStatus, loadProject, loadSummary, loadWorkspace } from '../pages/admin/common';
import { useAdminVersion } from '../pages/admin/sync';

export function AdminLayout() {
  const { session, logout } = useSession();
  const navigate = useNavigate();
  const version = useAdminVersion();
  const inProject = useMatch('/admin/projects/:projectId');
  // 올려야 할 문서 수(평가가 시작되어 잠긴 사업은 제외)
  const all = useLoad(async () => (await loadWorkspace()).filter(w => w.summary.progress.stage !== 'confirmed' && !w.summary.criteria.locked)
    .reduce((n, w) => n + docStatus(w.summary, w.docs).empty, 0), [version]);
  const missing = all.data ?? 0;
  return <div className="admin-shell">
    <a className="skip-link" href="#main">본문 바로가기</a>
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark" aria-hidden="true">심</span><div><strong>심사임당</strong><small>공공 제안평가 지원</small></div></div>
      <nav aria-label="관리자 메뉴">
        <small className="nav-group">업무</small>
        <NavLink to="/admin" end>대시보드</NavLink>
        <NavLink to="/admin/projects">사업 관리</NavLink>
        {inProject?.params.projectId && <ProjectSubnav pid={inProject.params.projectId} version={version} />}
        <NavLink to="/admin/documents" className="nav-with-count">문서 등록
          {missing > 0 && <span className="nav-count" aria-label={`올릴 문서 ${missing}개`}>{missing}</span>}</NavLink>
        <NavLink to="/admin/evaluators">평가위원 관리</NavLink>
      </nav>
      <div className="principle"><strong>판단은 사람이 해요</strong><p>AI는 근거를 찾아 줄 뿐이에요.</p></div>
      <div className="user-card">
        <div><strong>{session?.name}</strong><small>부서 관리자(간사)</small></div>
        <button className="btn ghost-dark sm" onClick={() => { logout(); navigate('/login', { replace: true }); }}>로그아웃</button>
      </div>
    </aside>
    <main id="main" className="admin-main"><Outlet /></main>
  </div>;
}

/** 사업 상세에 들어와 있을 때 "사업 관리" 아래에 펼쳐지는 현재 사업의 하위 메뉴. */
function ProjectSubnav({ pid, version }: { pid: string; version: number }) {
  const [params] = useSearchParams();
  const tab = params.get('tab') ?? 'overview';
  const focus = params.get('focus');
  const load = useLoad(async () => {
    const summary = await loadSummary(await loadProject(pid));
    const docs = await request<DocumentRead[]>('GET', `/api/v1/projects/${pid}/documents`);
    return { summary, docs };
  }, [pid, version]);
  if (!load.data) return null;
  const { summary, docs } = load.data;
  const { rfpDone, vendors, proposalsDone, firstMissingVendor } = docStatus(summary, docs);
  const members = summary.progress.members;
  const proposalsOk = vendors.length > 0 && proposalsDone.length === vendors.length;
  const criteriaOk = summary.criteria.status === 'confirmed';
  const committeeOk = members.length > 0 && !!summary.progress.chair_id;
  const base = `/admin/projects/${pid}`;
  // 준비 순서상 다음 할 일에 ● 표시
  const next = !rfpDone ? 'rfp' : !proposalsOk ? 'proposal' : !criteriaOk ? 'criteria' : !committeeOk ? 'committee' : null;
  const onDocs = tab === 'documents';
  const items: { key: string; label: string; to: string; mark?: string; active: boolean }[] = [
    { key: 'overview', label: '개요', to: base, active: tab === 'overview' },
    { key: 'rfp', label: '제안요청서 등록', to: `${base}?tab=documents&focus=rfp`, mark: rfpDone ? '✓' : undefined, active: onDocs && (focus === 'rfp' || !focus) },
    { key: 'proposal', label: `제안서 등록 (${proposalsDone.length}/${vendors.length})`, to: `${base}?tab=documents&focus=${firstMissingVendor ?? vendors[0] ?? 'rfp'}`,
      mark: proposalsOk ? '✓' : undefined, active: onDocs && !!focus && focus !== 'rfp' && focus !== 'criteria' },
    { key: 'criteria', label: '평가 기준', to: `${base}?tab=documents&focus=criteria`, mark: criteriaOk ? '✓' : undefined, active: onDocs && focus === 'criteria' },
    { key: 'committee', label: '평가위원', to: `${base}?tab=committee`, mark: committeeOk ? '✓' : undefined, active: tab === 'committee' },
    { key: 'progress', label: '진행 현황', to: `${base}?tab=progress`, active: tab === 'progress' },
    { key: 'results', label: '결과', to: `${base}?tab=results`, active: tab === 'results' },
  ];
  return <div className="subnav-project" role="group" aria-label={`${summary.project.name} 메뉴`}>
    {items.map(i => <Link key={i.key} to={i.to} className={i.active ? 'active' : ''} aria-current={i.active ? 'true' : undefined}>
      <span>{i.label}</span>
      {i.mark ? <span className="sub-mark done" aria-label="완료">{i.mark}</span>
        : next === i.key ? <span className="sub-mark next" aria-label="다음 할 일">●</span> : null}
    </Link>)}
  </div>;
}
