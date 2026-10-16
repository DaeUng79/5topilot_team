import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Notice } from '../../ui/ui';
import { nextStep, projectPath, stepLabel, stepNo, type StepKey } from './common';
import { useProjectData } from './ProjectContext';

/** 단계 화면 공통 틀: 작은 사업명 → 단계 제목 → 결론 한 줄 → 내용 → (끝났으면) 다음 단계 버튼 하나. */
export function StepFrame({ step, sub, children, hideNext = false }: { step: StepKey; sub: ReactNode; children: ReactNode; hideNext?: boolean }) {
  const { summary, steps, closed } = useProjectData();
  const pid = summary.project.id;
  const next = nextStep(step);
  return <div className="step-page">
    <Link className="step-proj" to={projectPath(pid)}>{summary.project.name}</Link>
    <h1 className="say-title">{stepNo(step)}. {stepLabel(step)}</h1>
    <p className="say-sub">{sub}</p>
    {closed && step !== 'close' && <Notice tone="info" title="완료된 사업이라 바꿀 수 없어요" />}
    {children}
    {steps.done[step] && next && !hideNext && <div className="step-next no-print">
      <Link className="btn primary lg" to={projectPath(pid, next)}>다음: {stepLabel(next)} ›</Link>
    </div>}
  </div>;
}

/** 선행 단계가 끝나지 않았을 때 내용 위에 한 번만 보여 주는 안내. 막지는 않습니다. */
export function NeedFirst({ pid, step, children }: { pid: string; step: StepKey; children: ReactNode }) {
  return <Notice tone="warning" title={children}>
    <Link to={projectPath(pid, step)}>{stepNo(step)}. {stepLabel(step)}으로 가기 ›</Link>
  </Notice>;
}
