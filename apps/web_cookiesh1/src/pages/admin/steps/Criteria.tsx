import { useProjectData } from '../ProjectContext';
import { NeedFirst, StepFrame } from '../StepFrame';
import { CriteriaReview } from './docParts';

export function CriteriaStep() {
  const { summary, steps, refresh } = useProjectData();
  const pid = summary.project.id;
  const confirmed = summary.criteria.status === 'confirmed';
  return <StepFrame step="criteria" sub={confirmed ? `평가기준을 확정했어요 (v${summary.criteria.version})` : 'AI가 만든 초안을 검토하고 사람이 확정해요'}>
    {!steps.rfpDone && summary.criteria.status === 'none'
      ? <NeedFirst pid={pid} step="rfp">제안요청서를 먼저 올려 주세요. 올리면 평가기준 초안이 만들어져요.</NeedFirst>
      : <CriteriaReview pid={pid} criteria={summary.criteria} onConfirmed={refresh} />}
  </StepFrame>;
}
