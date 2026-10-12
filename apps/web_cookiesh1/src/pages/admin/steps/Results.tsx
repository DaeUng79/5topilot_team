import { api, request, unwrap, type Project, type Results } from '../../../api/client';
import type { ResultsDetail } from '../../../api/contract';
import { useLoad } from '../../../lib/useLoad';
import { ResultsReport } from '../../../ui/ResultsReport';
import { Async } from '../../../ui/states';
import { useProjectData } from '../ProjectContext';
import { NeedFirst, StepFrame } from '../StepFrame';
import { Card, Notice, Progress } from '../../../ui/ui';

/** 결과 조회(결과 단계·보고 단계 공용). 전원 제출 전에는 detail이 null입니다. */
export function useResultsLoad(project: Project) {
  return useLoad(async () => {
    const results = unwrap(await api.GET('/api/v1/projects/{project_id}/results', { params: { path: { project_id: project.id } } }));
    const detail = results.status === 'technical_complete'
      ? await request<ResultsDetail>('GET', `/api/v1/projects/${project.id}/results/detail`) : null;
    return { results, detail };
  }, [project.id]);
}

export function ResultsStep() {
  const { summary, refresh } = useProjectData();
  const { project, progress } = summary;
  const load = useResultsLoad(project);
  const hasMembers = progress.members.some(m => m.role !== 'reserve');
  const confirmed = progress.stage === 'confirmed' || progress.stage === 'closed';
  // 위원장이 확인하면 단계 상태(다음 버튼)가 바뀌도록 다시 확인할 때 사업 정보도 함께 갱신합니다.
  const recheck = () => { void load.reload(); void refresh(); };
  return <StepFrame step="results" sub={confirmed ? '위원장이 결과를 확인했어요' : load.data?.detail ? '결과가 열렸어요. 위원장이 확인하면 마무리돼요' : '전원이 제출하면 결과가 열리고, 위원장이 확인해요'}>
    {!hasMembers ? <NeedFirst pid={project.id} step="committee">아직 평가위원이 없어요. 먼저 위원을 뽑아 주세요.</NeedFirst>
      : <Async load={load} loadingLabel="결과를 불러오는 중">
        {({ results, detail }) => detail ? <>
          <div className="row end no-print"><button className="btn" onClick={() => window.print()}>🖨 인쇄</button></div>
          <ResultsReport project={project} results={results} detail={detail} />
        </> : <Locked results={results} onRefresh={recheck} />}
      </Async>}
  </StepFrame>;
}

/** RES-01: 서버가 집계 완료를 알려 주기 전에는 순위·점수를 보여 주지 않습니다. */
export function Locked({ results, onRefresh }: { results: Results; onRefresh: () => void }) {
  return <Card className="locked-card">
    <div className="state">
      <div className="state-icon" aria-hidden="true">🔒</div>
      <span className="big-num">{results.submitted}<small> / {results.expected}</small></span>
      <p className="say-sub">{results.expected}명 중 {results.submitted}명이 제출했어요</p>
      <strong>모든 평가위원이 제출해야 결과가 열려요</strong>
      <p className="muted" title={`결과 공개 여부는 서버 응답(status: ${results.status})을 따릅니다.`}>현재 {results.submitted} / {results.expected}명 제출 · 공개 여부는 서버 응답을 따릅니다</p>
      <Progress value={results.submitted} max={results.expected} label="제출 진행률" />
      <button className="btn" onClick={onRefresh}>다시 확인</button>
    </div>
    <Notice tone="info">개인 점수와 순위는 전원 제출 전까지 관리자에게도 표시하지 않습니다.</Notice>
  </Card>;
}
