import { Link } from 'react-router';
import { formatDate } from '../../../lib/format';
import { Badge, Card } from '../../../ui/ui';
import { nowText, projectPath, stageInfo, stepLabel } from '../common';
import { useProjectData } from '../ProjectContext';

export function Overview() {
  const { summary, vendors, steps, closed } = useProjectData();
  const { project, progress, criteria } = summary;
  const members = progress.members.filter(m => m.role !== 'reserve');
  const submitted = members.filter(m => m.sheet_status === 'submitted').length;
  const text = nowText(steps.current, { vendors, proposalsDone: steps.proposalsDone.length, submittedLeft: members.length - submitted });
  return <div className="step-page">
    <p className="step-proj">{project.department} <Badge tone={stageInfo[progress.stage].tone}>{stageInfo[progress.stage].label}</Badge></p>
    <h1 className="say-title">{project.name}</h1>
    <p className="say-sub">{steps.current ? `지금 할 일: ${text}` : closed ? '이 사업은 완료됐어요' : text}</p>
    {steps.current && <div className="step-next-top">
      <Link className="btn primary lg" to={projectPath(project.id, steps.current)}>{stepLabel(steps.current)}으로 가기 ›</Link>
    </div>}
    <Card title="간단 요약">
      <dl className="dl">
        <dt>평가일</dt><dd>{formatDate(progress.evaluation_date)}</dd>
        <dt>평가기준</dt><dd>{criteria.status === 'confirmed' ? `확정 v${criteria.version} · ${criteria.items.length}개 항목` : criteria.status === 'draft' ? '초안 검토 중' : '제안요청서 대기'}</dd>
        <dt>제안사</dt><dd>{vendors.length ? `${vendors.length}곳 · 제안서 ${steps.proposalsDone.length}곳 등록` : '아직 없어요'}</dd>
        <dt>평가위원</dt><dd>{members.length ? `본위원 ${members.length}명 · 예비 ${progress.members.length - members.length}명` : '추첨 전'}</dd>
        <dt>제출</dt><dd>{members.length ? `${submitted} / ${members.length}명` : '-'}</dd>
      </dl>
    </Card>
  </div>;
}
