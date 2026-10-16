import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Project } from '../../api/client';
import { vendorName } from './EvaluationPage';
import { loadProposalSummaries, type ProposalSummary } from './proposalSummaries';
import './proposal-compare.css';

// 기술평가표의 평가항목에 마우스를 올리거나 ⓘ를 누르면 화면 하단에 업체별 제안서 요약 비교 패널을 띄운다.
// 점수 입력 상태(ScoreEditor)와는 별개의 상태만 다루며, 요약 자료는 읽기 전용이다.
// 주의: 전역 스타일이 <header>를 상단 고정 바로 만들므로 패널 안에서는 header/footer 태그를 쓰지 않는다.

type Criterion = Project['criteria'][number];
const CLOSE_DELAY_MS = 180; // 항목에서 패널로 마우스를 옮기는 동안 닫히지 않도록 잠깐 기다린다.

export function useProposalCompare(project: Project) {
  const [criterionId, setCriterionId] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const [summaries, setSummaries] = useState<ProposalSummary[]>([]);
  const closeTimer = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    void loadProposalSummaries(project).then(loaded => { if (alive) setSummaries(loaded); });
    return () => { alive = false; };
  }, [project.id]);

  function cancelClose() {
    if (closeTimer.current !== null) { window.clearTimeout(closeTimer.current); closeTimer.current = null; }
  }
  function close() { cancelClose(); setPinned(false); setCriterionId(null); }
  function hover(id: string) { if (pinned) return; cancelClose(); setCriterionId(id); }
  function leave() {
    if (pinned) return;
    cancelClose();
    closeTimer.current = window.setTimeout(() => { closeTimer.current = null; setCriterionId(null); }, CLOSE_DELAY_MS);
  }
  function toggle(id: string) {
    cancelClose();
    if (pinned && criterionId === id) { setPinned(false); setCriterionId(null); return; }
    setPinned(true); setCriterionId(id);
  }
  useEffect(() => {
    if (criterionId === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [criterionId]);
  useEffect(() => cancelClose, []);

  const criterion = project.criteria.find(c => c.id === criterionId) ?? null;
  const panel: ReactNode = criterion && <>
    <ProposalComparePanel project={project} criterion={criterion} pinned={pinned}
      summaries={summaries.filter(s => s.criterion_id === criterion.id)}
      onClose={close} onMouseEnter={cancelClose} onMouseLeave={leave} />
    <div className="compare-spacer" aria-hidden="true" />
  </>;

  return {
    panel,
    labelProps: (id: string) => ({
      active: criterionId === id,
      pinned: pinned && criterionId === id,
      onHover: () => hover(id),
      onLeave: leave,
      onToggle: () => toggle(id),
    }),
  };
}

export function CriterionLabel({ criterion, active, pinned, onHover, onLeave, onToggle }: {
  criterion: Criterion; active: boolean; pinned: boolean; onHover: () => void; onLeave: () => void; onToggle: () => void;
}) {
  return <span className="criterion-label" onMouseEnter={onHover} onMouseLeave={onLeave}>
    {criterion.name}
    <button type="button" className={`info-icon ${active ? 'on' : ''}`} aria-controls="proposal-compare-panel"
      aria-expanded={active} aria-pressed={pinned} title="업체별 제안서 요약 비교 (클릭하면 고정)"
      aria-label={`${criterion.name} 업체별 제안서 요약 ${pinned ? '고정 해제' : '보기'}`}
      onClick={onToggle} onFocus={onHover} onBlur={onLeave}>ⓘ</button>
  </span>;
}

export function ProposalComparePanel({ project, criterion, summaries, pinned, onClose, onMouseEnter, onMouseLeave }: {
  project: Project; criterion: Criterion; summaries: ProposalSummary[]; pinned: boolean;
  onClose: () => void; onMouseEnter: () => void; onMouseLeave: () => void;
}) {
  const byVendor = new Map(summaries.map(s => [s.vendor_id, s]));
  const example = summaries.some(s => s.is_example);
  return <aside id="proposal-compare-panel" className="compare-panel" role="region" data-testid="proposal-compare"
    aria-label={`${criterion.name} 업체별 제안서 요약 비교`} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
    <div className="compare-head">
      <div className="compare-title">
        <strong data-testid="compare-criterion">{criterion.name}</strong>
        <span className="compare-guide">각 업체가 이 항목에 대해 제안서에 쓴 핵심 내용을 1~2줄로 비교합니다.
          {pinned ? ' 패널이 고정되어 있습니다. 닫으려면 X를 누르세요.' : ' ⓘ를 클릭하면 패널이 고정됩니다.'}</span>
      </div>
      {example && <span className="badge example-badge">예시 자료 · 실제 제안서 내용 아님</span>}
      <button type="button" className="compare-close" aria-label="비교 패널 닫기" onClick={onClose}>×</button>
    </div>
    <div className="compare-body">
      {project.vendor_ids.map((vendorId, index) => {
        const summary = byVendor.get(vendorId);
        return <article key={vendorId} className={`vendor-card tone-${index % 5}`} aria-label={`${vendorName(project, vendorId)} 요약`}>
          <div className="vendor-head"><strong>{vendorName(project, vendorId)}</strong>{summary?.is_example && <span className="example-tag">예시</span>}</div>
          {summary
            ? <ul>{summary.items.slice(0, 2).map((item, k) => <li key={k}>{item.text}</li>)}</ul>
            : <p className="muted no-summary">제안서 요약 정보가 없습니다.</p>}
          {summary && <div className="vendor-foot">원문 {summary.items.slice(0, 2).map(item => `p.${item.page}`).join(', ')}
            <span className="doc-ref"> · {summary.source_document_id} {summary.source_revision}</span></div>}
        </article>;
      })}
    </div>
  </aside>;
}
