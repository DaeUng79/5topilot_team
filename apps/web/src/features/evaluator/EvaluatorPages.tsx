import { useEffect, useState } from 'react';
import { sessionApi, unwrap, type AccessContext, type Project, type ResultsSummary, type Sheet } from '../../api/client';
import type { StoredSession } from '../auth/session';
import { ChairSummaryPanel, ScoreStep, SubmittedSheetPanel, detail } from './EvaluatorApp';

// 로그인 화면으로 들어온 평가위원이 공통 화면(App)에서 쓰는 두 메뉴. 접근 링크 화면(EvaluatorApp)과
// 같은 채점·제출·서명 컴포넌트를 재사용하며, 결과는 서버 권한(위원장·간사만 종합 결과)에 따라 보여 준다.

function contextFor(session: StoredSession, project: Project): AccessContext {
  return {
    project: { id: project.id, name: project.name, department: project.department },
    candidate: { id: session.actor.id, name: session.actor.name ?? session.actor.id },
    criteria_version: 0,
  };
}

export function EvaluatorScorePage({ session, project, onExpired }: {
  session: StoredSession; project: Project; onExpired: (message: string) => void;
}) {
  return <>
    <h1>평가·제출·취합</h1>
    <p className="muted">{project.name} · {project.department} · 배정된 사업의 평가표를 작성해 저장하고, 모든 칸을 채운 뒤 본인 확인에 동의하면 제출됩니다.</p>
    <ScoreStep key={project.id} token={session.token} context={contextFor(session, project)} params={{ path: { project_id: project.id } }}
      onExpired={onExpired} onDone={() => undefined} standalone={false} />
  </>;
}

export function EvaluatorResultsPage({ session, project, onExpired }: {
  session: StoredSession; project: Project; onExpired: (message: string) => void;
}) {
  const client = sessionApi(session.token);
  const params = { path: { project_id: project.id } };
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [summary, setSummary] = useState<ResultsSummary | null>(null);
  const [summaryStatus, setSummaryStatus] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const mine = await client.GET('/api/v1/projects/{project_id}/evaluations/me', { params });
    if (mine.response.status === 401) { onExpired('세션이 끝났습니다. 다시 로그인하세요.'); return; }
    if (!mine.response.ok) { setError(detail(mine)); return; }
    setSheet(mine.data ?? null);
    const result = await client.GET('/api/v1/projects/{project_id}/results/summary', { params });
    setSummaryStatus(result.response.status);
    setSummary(result.response.ok && result.data ? result.data : null); // 위원장만 200, 일반 위원은 403
  }
  useEffect(() => { void load(); }, [project.id]);

  async function confirm(signature: string) {
    setBusy(true); setError('');
    try {
      unwrap(await client.POST('/api/v1/projects/{project_id}/results/confirm', { params, body: { reviewed: true, signature_image: signature } }));
      await load();
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }

  return <>
    <h1>결과·서명·리포트</h1>
    <p className="muted">{project.name} · 본인의 제출·서명 내역과 권한에 따라 허용된 결과만 보여 줍니다.</p>
    {error && <div className="error" role="alert">{error}</div>}
    {sheet?.status === 'submitted'
      ? <SubmittedSheetPanel project={project} sheet={sheet} />
      : <section className="panel"><h2>내 평가표</h2>
        <p className="muted">{sheet ? '임시저장 상태입니다. 평가·제출·취합 메뉴에서 작성을 마치고 제출하세요.' : '아직 작성하지 않았습니다. 평가·제출·취합 메뉴에서 작성하세요.'}</p>
      </section>}
    {summary
      ? <ChairSummaryPanel project={project} summary={summary} busy={busy} onConfirm={s => void confirm(s)} />
      : <section className="panel"><h2>종합 결과</h2>
        <p className="muted">{summaryStatus === 403
          ? '종합 결과(평균·순위)는 위원장과 간사만 열람할 수 있습니다. 확정된 결과표는 간사가 별도로 공개합니다.'
          : summaryStatus === 0 ? '결과를 불러오는 중입니다.' : '종합 결과를 불러오지 못했습니다.'}</p>
      </section>}
  </>;
}
