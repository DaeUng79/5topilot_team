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
          <Link to="/eval" className="head-back">‹ 배정된 평가</Link>
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
  { title: '보안 서약', text: '평가 자료를 외부에 누설·반출·촬영하지 않습니다.' },
  { title: '청렴 서약', text: '제안사와 이해관계가 없으며 발생 시 즉시 알리고 회피합니다.' },
  { title: '개인정보 수집·이용', text: '본인확인 목적 · 이름, 휴대폰 번호', note: '문구는 기관 확정 필요' },
];

function PledgeSheet({ projectId, onAgreed }: { projectId: string; onAgreed: () => void }) {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(() => pledgeItems.map(() => false));
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const all = checked.every(Boolean);
  async function agree() {
    setBusy(true); setError(null);
    try { await request<Pledge>('POST', `/api/v1/projects/${projectId}/pledge/me`, {}); onAgreed(); }
    catch (e) { setError(e); } finally { setBusy(false); }
  }
  return <Dialog open variant="sheet" onClose={() => navigate('/eval')} title={<>평가를 시작하기 전에<br />꼭 필요한 서약만 추렸어요</>}
    actions={<>
      <button className="btn primary block lg" disabled={!all || busy} onClick={() => void agree()}>{busy ? '기록 중…' : '동의하고 평가 시작'}</button>
      <button className="btn ghost block" onClick={() => navigate('/eval')}>나중에 하기</button>
    </>}>
    <label className="pledge-all"><input type="checkbox" className="circle-check" checked={all} onChange={e => setChecked(pledgeItems.map(() => e.target.checked))} />
      <span><span className="req-badge">필수</span> 보안 및 청렴 서약에 모두 동의합니다</span></label>
    <ul className="pledge-items">{pledgeItems.map((it, i) => <li key={it.title}>
      <label><input type="checkbox" className="circle-check" checked={checked[i]} onChange={e => setChecked(old => old.map((x, j) => j === i ? e.target.checked : x))} />
        <span><span className="req-badge">필수</span> <strong>{it.title}</strong>
          <span className="pledge-text">{it.text}</span>
          {'note' in it && <span className="pledge-note">{it.note}</span>}</span></label>
    </li>)}</ul>
    {error !== null && <Notice tone="danger" role="alert" title={describeError(error).title}>{describeError(error).detail}</Notice>}
    <p className="muted small">동의 시각이 기록됩니다. 이 동의는 전자서명이 아닙니다.</p>
  </Dialog>;
}
