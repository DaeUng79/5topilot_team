import { Link } from 'react-router';
import type { DocumentRead } from '../../api/contract';
import { docStatus, type ProjectSummary } from './common';

type State = 'done' | 'next' | 'wait';
interface Item { key: string; label: string; note?: string; done: boolean; to: string }

/** 사업 준비 작업 5가지. 사업 전체 단계(Steps)와 달리 "지금 내가 할 일"만 보여 줍니다. */
export function PrepChecklist({ summary, docs }: { summary: ProjectSummary; docs: DocumentRead[] | undefined }) {
  const { progress, criteria } = summary;
  const { rfpDone, vendors, proposalsDone, firstMissingVendor } = docStatus(summary, docs);
  const items: Item[] = [
    { key: 'rfp', label: '제안요청서 등록', done: rfpDone, to: '?tab=documents&focus=rfp' },
    { key: 'proposal', label: '제안서 등록', note: `${proposalsDone.length}/${vendors.length} 업체`,
      done: vendors.length > 0 && proposalsDone.length === vendors.length, to: `?tab=documents&focus=${firstMissingVendor ?? 'rfp'}` },
    { key: 'criteria', label: '평가 기준 정하기', done: criteria.status === 'confirmed', to: '?tab=documents&focus=criteria' },
    { key: 'draw', label: '위원 뽑기', done: progress.members.length > 0, to: '?tab=committee' },
    { key: 'chair', label: '위원장 정하기', done: !!progress.chair_id, to: '?tab=committee' },
  ];
  if (!docs) return null;
  const allDone = items.every(i => i.done);
  const nextKey = items.find(i => !i.done)?.key;
  const list = <ol>{items.map(i => {
    const state: State = i.done ? 'done' : i.key === nextKey ? 'next' : 'wait';
    return <li key={i.key} className={`prep-${state}`}>
      <Link to={i.to} replace aria-current={state === 'next' ? 'step' : undefined}>
        <span className="prep-mark" aria-hidden="true">{state === 'done' ? '✓' : state === 'next' ? '●' : '○'}</span>
        <span className="prep-text"><strong>{i.label}</strong>{i.note && <small>{i.note}</small>}</span>
        <span className="sr-only">{state === 'done' ? '완료' : state === 'next' ? '다음 할 일' : '대기'}</span>
      </Link>
    </li>;
  })}</ol>;
  if (allDone) return <details className="prep prep-collapsed">
    <summary><span className="prep-mark" aria-hidden="true">✓</span><strong>준비 완료</strong><span className="muted">펼치기</span></summary>
    {list}
  </details>;
  return <nav className="prep" aria-label="준비 체크리스트">{list}</nav>;
}
