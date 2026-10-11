import { Link, useParams } from 'react-router';
import { useLoad } from '../../lib/useLoad';
import { formatDate } from '../../lib/format';
import { Async } from '../../ui/states';
import { Badge, Card, PageHeader, Steps, Tabs, useTab } from '../../ui/ui';
import { loadProject, loadSummary, stageInfo, stepsFor, todoOf, type ProjectSummary } from './common';
import { DocumentsTab } from './tabs/DocumentsTab';
import { CommitteeTab } from './tabs/CommitteeTab';
import { ProgressTab } from './tabs/ProgressTab';
import { ResultsTab } from './tabs/ResultsTab';

export function ProjectDetail() {
  const { projectId = '' } = useParams();
  const load = useLoad(async () => loadSummary(await loadProject(projectId)), [projectId]);
  const tab = useTab('overview');
  return <Async load={load} loadingLabel="사업 정보를 불러오는 중">
    {summary => <>
      <PageHeader eyebrow={<Link to="/admin/projects">‹ 사업 관리</Link>} title={summary.project.name}
        description={`${summary.project.department} · 평가일 ${formatDate(summary.progress.evaluation_date)}`}
        actions={<Badge tone={stageInfo[summary.progress.stage].tone}>{stageInfo[summary.progress.stage].label}</Badge>} />
      <Steps steps={stepsFor(summary.progress.stage)} current={stageInfo[summary.progress.stage].current} />
      <Tabs tabs={[
        { key: 'overview', label: '개요' }, { key: 'documents', label: '문서·평가기준' }, { key: 'committee', label: '평가위원' },
        { key: 'progress', label: '진행 현황' }, { key: 'results', label: '결과' },
      ]} />
      <div className="tab-body">
        {tab === 'overview' && <Overview summary={summary} />}
        {tab === 'documents' && <DocumentsTab summary={summary} onChanged={load.reload} />}
        {tab === 'committee' && <CommitteeTab summary={summary} onChanged={load.reload} />}
        {tab === 'progress' && <ProgressTab project={summary.project} />}
        {tab === 'results' && <ResultsTab project={summary.project} />}
      </div>
    </>}
  </Async>;
}

function Overview({ summary }: { summary: ProjectSummary }) {
  const { project, progress, criteria } = summary;
  const todo = todoOf(summary);
  const members = progress.members.filter(m => m.role !== 'reserve');
  const chair = progress.members.find(m => m.role === 'chair');
  return <div className="grid-2">
    <Card title="다음 할 일">
      {todo ? <><p className="lead">{todo.text}</p><Link className="btn primary" to={`?tab=${todo.tab}`}>바로 진행하기 ›</Link></>
        : <p className="lead">모든 단계를 마쳤습니다. 결과 탭에서 보고서를 확인하세요.</p>}
    </Card>
    <Card title="사업 요약">
      <dl className="dl">
        <dt>평가기준</dt><dd>{criteria.status === 'confirmed' ? `확정 v${criteria.version} · ${criteria.items.length}개 항목 · 기술 ${criteria.technical_total}점`
          : criteria.status === 'draft' ? '초안 검토 중' : '제안요청서 대기'}</dd>
        <dt>제안사</dt><dd>{project.vendor_ids.length}개사</dd>
        <dt>평가위원</dt><dd>{members.length ? `본위원 ${members.length}명 · 예비 ${progress.members.length - members.length}명` : '추첨 전'}</dd>
        <dt>위원장</dt><dd>{chair ? chair.name : '미지정'}</dd>
        <dt>제출</dt><dd>{members.length ? `${members.filter(m => m.sheet_status === 'submitted').length} / ${members.length}` : '-'}</dd>
      </dl>
    </Card>
  </div>;
}
