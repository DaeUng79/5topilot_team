import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useOutletContext, useParams } from 'react-router';
import { api, describeError, request, unwrap, type Project } from '../../api/client';
import type { Assignment, CriteriaRead, Pledge } from '../../api/contract';
import { useLoad } from '../../lib/useLoad';
import { Async, Forbidden } from '../../ui/states';
import { Dialog, Notice } from '../../ui/ui';

export interface EvalCtx { project: Project; assignment: Assignment; criteria: CriteriaRead; reload: () => Promise<void> }
export const useEval = () => useOutletContext<EvalCtx>();

export function EvalProject() {
  const { projectId = '' } = useParams();
  const load = useLoad(async () => {
    const assignment = (await request<Assignment[]>('GET', '/api/v1/me/assignments')).find(a => a.project_id === projectId);
    if (!assignment || assignment.role === 'reserve') return { assignment, project: null, criteria: null, pledge: null };
    const [projects, criteria, pledge] = await Promise.all([
      api.GET('/api/v1/projects').then(unwrap),
      request<CriteriaRead>('GET', `/api/v1/projects/${projectId}/criteria`),
      request<Pledge>('GET', `/api/v1/projects/${projectId}/pledge/me`),
    ]);
    return { assignment, project: projects.find(p => p.id === projectId) ?? null, criteria, pledge };
  }, [projectId]);

  return <Async load={load} loadingLabel="사업 정보를 불러오는 중">
    {({ assignment, project, criteria, pledge }) => {
      if (!assignment) return <Forbidden detail="이 사업에 배정된 평가위원이 아닙니다." action={<Link className="btn" to="/eval">배정된 사업 보기</Link>} />;
      if (assignment.role === 'reserve' || !project || !criteria) return <Forbidden detail="예비위원은 평가표에 접근할 수 없습니다. 본위원 결원 시 간사가 안내합니다." action={<Link className="btn" to="/eval">돌아가기</Link>} />;
      return <>
        <div className="eval-project-head">
          <Link to="/eval" className="muted">‹ 배정된 평가</Link>
          <h1>{project.name}</h1>
          <nav className="subnav" aria-label="평가 메뉴">
            <NavLink end to=".">평가 홈</NavLink><NavLink to="docs">자료 보기</NavLink>
            <NavLink to="evaluate">평가하기</NavLink><NavLink to="submit">제출</NavLink>
            {assignment.role === 'chair' && <NavLink to="chair">위원장 확인</NavLink>}
          </nav>
        </div>
        {pledge?.agreed_at ? <Outlet context={{ project, assignment, criteria, reload: load.reload } satisfies EvalCtx} />
          : <PledgeSheet projectId={project.id} onAgreed={() => void load.reload()} />}
      </>;
    }}
  </Async>;
}

const pledgeItems = [
  '평가 자료를 평가 목적 외로 쓰거나 다른 사람에게 주지 않습니다.',
  '제안사와 이해관계가 있으면 즉시 간사에게 알립니다.',
  '점수와 의견은 저의 독립적인 판단으로 작성합니다.',
  '평가가 끝난 뒤에도 관련 정보를 비밀로 지킵니다.',
];

function PledgeSheet({ projectId, onAgreed }: { projectId: string; onAgreed: () => void }) {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  async function agree() {
    setBusy(true); setError(null);
    try { await request<Pledge>('POST', `/api/v1/projects/${projectId}/pledge/me`, {}); onAgreed(); }
    catch (e) { setError(e); } finally { setBusy(false); }
  }
  return <Dialog open variant="sheet" onClose={() => navigate('/eval')} title={<>평가를 시작하기 전에<br />꼭 필요한 서약만 추렸어요</>}
    actions={<>
      <button className="btn primary block lg" disabled={!checked || busy} onClick={() => void agree()}>{busy ? '기록 중…' : '동의하고 평가 시작'}</button>
      <button className="btn ghost block" onClick={() => navigate('/eval')}>나중에 하기</button>
    </>}>
    <ol className="pledge-list">{pledgeItems.map(t => <li key={t}>{t}</li>)}</ol>
    <label className="check big"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />
      <span><strong>[필수]</strong> 보안 및 청렴 서약 내용을 확인했으며 동의합니다.</span></label>
    {error !== null && <Notice tone="danger" role="alert" title={describeError(error).title}>{describeError(error).detail}</Notice>}
    <p className="muted small">동의 시각이 기록됩니다. 이 동의는 전자서명이 아닙니다.</p>
  </Dialog>;
}
