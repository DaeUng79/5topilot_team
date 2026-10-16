import { useState } from 'react';
import { describeError, request } from '../../../api/client';
import type { ProjectClose } from '../../../api/contract';
import { formatDateTime } from '../../../lib/format';
import { ResultsReport } from '../../../ui/ResultsReport';
import { Async } from '../../../ui/states';
import { Badge, Card, Dialog, Notice, useToast } from '../../../ui/ui';
import { useProjectData } from '../ProjectContext';
import { Link } from 'react-router';
import { projectPath } from '../common';
import { StepFrame } from '../StepFrame';
import { useResultsLoad } from './Results';

export function CloseStep() {
  const { summary, closed, closedInfo, linked, refresh } = useProjectData();
  const { project } = summary;
  const load = useResultsLoad(project);
  const toast = useToast();
  const [checked, setChecked] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const detail = load.data?.detail ?? null;
  const chairConfirmed = !!detail?.confirmation || summary.progress.stage === 'confirmed' || closed;
  const reason = closed ? '' : !linked.close ? '사업 완료 API가 연결되면 쓸 수 있어요.' : !chairConfirmed ? '위원장이 결과를 확인한 뒤에 완료할 수 있어요.' : !checked ? '아래 확인란에 체크하면 완료할 수 있어요.' : '';

  async function close() {
    setBusy(true); setError(null);
    try { await request('POST', `/api/v1/projects/${project.id}/close`, { attested: true } satisfies ProjectClose); setConfirming(false); await refresh(); toast('사업을 완료했어요.'); }
    catch (e) { setError(e); setConfirming(false); } finally { setBusy(false); }
  }

  return <StepFrame step="close" sub={closed ? '이 사업은 완료됐어요' : '보고서를 확인하고 사업을 마무리해요'}>
    <Card title="사업 완료" className="no-print">
      {closed ? <p className="lead"><Badge tone="success">완료됨</Badge> {formatDateTime(closedInfo?.closed_at)} · {closedInfo?.closed_by ?? '-'}</p> : <>
        <label className="check"><input type="checkbox" checked={checked} disabled={!chairConfirmed} onChange={e => setChecked(e.target.checked)} />결과와 보고서를 확인했어요</label>
        {error !== null && <Notice tone="danger" role="alert" title={describeError(error).title}>{describeError(error).detail}</Notice>}
        <div className="row end">{reason && <span className="muted" id="close-reason">{reason}{!chairConfirmed && <> <Link to={projectPath(project.id, 'results')}>결과 확인 단계로 ›</Link></>}</span>}
          <button className="btn primary" disabled={!!reason} aria-describedby={reason ? 'close-reason' : undefined} onClick={() => setConfirming(true)}>사업 완료</button></div>
      </>}
    </Card>
    <Async load={load} loadingLabel="보고서를 불러오는 중">
      {({ results }) => detail ? <>
        <div className="row end no-print"><button className="btn" onClick={() => window.print()}>🖨 보고서 인쇄</button></div>
        <ResultsReport project={project} results={results} detail={detail} />
      </> : <Notice tone="info" title="보고서는 전원 제출 후에 볼 수 있어요" />}
    </Async>
    <Dialog open={confirming} onClose={() => setConfirming(false)} title="사업을 완료할까요?" actions={<>
      <button className="btn" onClick={() => setConfirming(false)}>취소</button>
      <button className="btn primary" disabled={busy} onClick={() => void close()}>{busy ? '완료 중…' : '완료'}</button></>}>
      <p>완료하면 문서·평가기준·위원·평가 내용을 더 이상 바꿀 수 없어요.</p>
      <p className="muted">되돌릴 수 없고, 완료한 사람과 시각이 기록됩니다.</p>
    </Dialog>
  </StepFrame>;
}
