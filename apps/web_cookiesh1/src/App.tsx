import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Link, Navigate, Outlet, RouterProvider, useLocation } from 'react-router';
import type { Role } from './api/contract';
import { useSession } from './lib/session';
import { AdminLayout } from './layouts/AdminLayout';
import { EvalLayout } from './layouts/EvalLayout';
import { LoginPage } from './pages/Login';
import { Dashboard } from './pages/admin/Dashboard';
import { ProjectsPage } from './pages/admin/Projects';
import { ProjectDetail } from './pages/admin/ProjectDetail';
import { EvaluatorsPage } from './pages/admin/Evaluators';
import { Overview } from './pages/admin/steps/Overview';
import { RfpStep } from './pages/admin/steps/Rfp';
import { CriteriaStep } from './pages/admin/steps/Criteria';
import { ProposalsStep } from './pages/admin/steps/Proposals';
import { CommitteeStep } from './pages/admin/steps/Committee';
import { ProgressStep } from './pages/admin/steps/Progress';
import { ResultsStep } from './pages/admin/steps/Results';
import { CloseStep } from './pages/admin/steps/Close';
import { AssignedPage } from './pages/eval/Assigned';
import { EvalProject } from './pages/eval/EvalProject';
import { EvalHome } from './pages/eval/EvalHome';
import { DocsPage } from './pages/eval/Docs';
import { EvaluatePage } from './pages/eval/Evaluate';
import { SubmitPage } from './pages/eval/Submit';
import { ChairPage } from './pages/eval/Chair';
import { Forbidden } from './ui/states';

// 시연 도구는 VITE_USE_MOCK=1 빌드에서만 포함됩니다.
const DemoPanel = import.meta.env.VITE_USE_MOCK === '1' ? lazy(() => import('./demo/DemoPanel')) : null;

function Root() {
  return <>
    {import.meta.env.VITE_USE_MOCK === '1' && <div className="mock-banner" role="note">MOCK · 실제 서버 아님 — 합성 데이터로 화면을 확인하는 모드입니다</div>}
    <Outlet />
    {DemoPanel && <Suspense fallback={null}><DemoPanel /></Suspense>}
  </>;
}

const homeOf = (role: Role) => (role === 'admin' ? '/admin' : '/eval');

function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { session, loggedOut } = useSession();
  const location = useLocation();
  // 직접 로그아웃했으면 돌아올 위치(next)를 남기지 않습니다.
  if (!session && loggedOut) return <Navigate to="/login" replace />;
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (session.role !== role) return <main className="center-page"><Forbidden
    detail={role === 'admin' ? '관리자 화면입니다. 평가위원 계정으로는 볼 수 없습니다.' : '평가위원 화면입니다. 관리자 계정으로는 볼 수 없습니다.'}
    action={<Link className="btn" to={homeOf(session.role)}>내 화면으로 이동</Link>} /></main>;
  return children;
}

function Home() {
  const { session } = useSession();
  // 로그인 전이면 첫 화면(랜딩), 로그인 상태면 역할 홈으로 갑니다.
  return session ? <Navigate to={homeOf(session.role)} replace /> : <LoginPage intro />;
}

function NotFound() {
  return <main className="center-page"><div className="state"><strong>페이지를 찾을 수 없어요</strong>
    <p className="muted">주소가 바뀌었거나 없는 화면입니다.</p><Link className="btn" to="/">처음으로</Link></div></main>;
}

const router = createBrowserRouter([{
  element: <Root />,
  children: [
    { path: '/', element: <Home /> },
    { path: '/login', element: <LoginPage /> },
    {
      path: '/admin', element: <RequireRole role="admin"><AdminLayout /></RequireRole>,
      children: [
        { index: true, element: <Dashboard /> },
        { path: 'projects', element: <ProjectsPage /> },
        {
          path: 'projects/:projectId', element: <ProjectDetail />,
          children: [
            { index: true, element: <Overview /> },
            { path: 'rfp', element: <RfpStep /> },
            { path: 'criteria', element: <CriteriaStep /> },
            { path: 'proposals', element: <ProposalsStep /> },
            { path: 'committee', element: <CommitteeStep /> },
            { path: 'progress', element: <ProgressStep /> },
            { path: 'results', element: <ResultsStep /> },
            { path: 'close', element: <CloseStep /> },
          ],
        },
        { path: 'evaluators', element: <EvaluatorsPage /> },
        { path: 'documents', element: <Navigate to="/admin/projects" replace /> },
      ],
    },
    {
      path: '/eval', element: <RequireRole role="evaluator"><EvalLayout /></RequireRole>,
      children: [
        { index: true, element: <AssignedPage /> },
        {
          path: 'projects/:projectId', element: <EvalProject />,
          children: [
            { index: true, element: <EvalHome /> },
            { path: 'docs', element: <DocsPage /> },
            { path: 'evaluate', element: <EvaluatePage /> },
            { path: 'submit', element: <SubmitPage /> },
            { path: 'chair', element: <ChairPage /> },
          ],
        },
      ],
    },
    { path: '*', element: <NotFound /> },
  ],
}]);

export function App() { return <RouterProvider router={router} />; }
