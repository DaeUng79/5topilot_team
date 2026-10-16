import { Navigate, NavLink, Outlet, useLocation, useSearchParams } from 'react-router';
import { Loading, ErrorState } from '../../ui/states';
import { projectPath, STEPS, type StepKey } from './common';
import { useProject } from './ProjectContext';

/** 사업 화면 틀. 데이터는 AdminLayout이 한 번만 불러와 컨텍스트로 나눠 줍니다. */
export function ProjectDetail() {
  const { data, state, error, refresh, pid = '' } = useProject();
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const base = projectPath(pid);

  // 예전 ?tab= 주소는 새 단계 주소로 옮깁니다.
  const tab = params.get('tab');
  if (tab && pathname.replace(/\/$/, '') === base) {
    const focus = params.get('focus');
    const to: StepKey | '' = tab === 'documents' ? (focus === 'criteria' ? 'criteria' : focus && focus !== 'rfp' ? 'proposals' : 'rfp')
      : tab === 'committee' || tab === 'progress' || tab === 'results' ? tab : '';
    return <Navigate to={to ? projectPath(pid, to) : base} replace />;
  }
  if (!data) return state === 'error' ? <ErrorState error={error} onRetry={() => void refresh()} /> : <Loading label="사업 정보를 불러오는 중" />;

  return <>
    <nav className="step-chips no-print" aria-label="사업 단계">
      {STEPS.map((s, i) => {
        const mark = data.steps.done[s.key] ? '✓' : data.steps.current === s.key ? '●' : String(i + 1);
        return <NavLink key={s.key} to={projectPath(pid, s.key)} className={data.steps.current === s.key ? 'now' : ''}>
          <span aria-hidden="true">{mark}</span> {s.label}</NavLink>;
      })}
    </nav>
    <Outlet />
  </>;
}
