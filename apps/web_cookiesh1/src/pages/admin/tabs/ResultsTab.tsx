import { api, request, unwrap, type Project, type Results } from '../../../api/client';
import type { ResultsDetail } from '../../../api/contract';
import { useLoad } from '../../../lib/useLoad';
import { ResultsReport } from '../../../ui/ResultsReport';
import { Async } from '../../../ui/states';
import { Card, Notice, Progress } from '../../../ui/ui';

export function ResultsTab({ project }: { project: Project }) {
  const load = useLoad(async () => {
    const results = unwrap(await api.GET('/api/v1/projects/{project_id}/results', { params: { path: { project_id: project.id } } }));
    const detail = results.status === 'technical_complete'
      ? await request<ResultsDetail>('GET', `/api/v1/projects/${project.id}/results/detail`) : null;
    return { results, detail };
  }, [project.id]);
  return <Async load={load} loadingLabel="결과를 불러오는 중">
    {({ results, detail }) => detail ? <>
      <div className="row end no-print"><button className="btn" onClick={() => window.print()}>🖨 인쇄</button></div>
      <ResultsReport project={project} results={results} detail={detail} />
    </> : <Locked results={results} onRefresh={() => void load.reload()} />}
  </Async>;
}

/** RES-01: 서버가 집계 완료를 알려 주기 전에는 순위·점수를 보여 주지 않습니다. */
export function Locked({ results, onRefresh }: { results: Results; onRefresh: () => void }) {
  return <Card className="locked-card">
    <div className="state">
      <div className="state-icon" aria-hidden="true">🔒</div>
      <strong>모든 평가위원이 제출해야 결과가 열려요</strong>
      <p className="muted">현재 {results.submitted} / {results.expected}명 제출. 결과 공개 여부는 서버 응답(status: {results.status})을 따릅니다.</p>
      <Progress value={results.submitted} max={results.expected} label="제출 진행률" />
      <button className="btn" onClick={onRefresh}>다시 확인</button>
    </div>
    <Notice tone="info">개인 점수와 순위는 전원 제출 전까지 관리자에게도 표시하지 않습니다.</Notice>
  </Card>;
}
