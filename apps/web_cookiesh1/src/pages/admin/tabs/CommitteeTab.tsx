import { useState } from 'react';
import { Link } from 'react-router';
import { api, describeError, request, unwrap, type Candidate, type Draw } from '../../../api/client';
import type { ChairSet, DrawExclusion } from '../../../api/contract';
import { useLoad } from '../../../lib/useLoad';
import { formatDateTime } from '../../../lib/format';
import { Async, Empty } from '../../../ui/states';
import { Badge, Card, Dialog, Notice, useToast } from '../../../ui/ui';
import type { ProjectSummary } from '../common';

export function CommitteeTab({ summary, onChanged }: { summary: ProjectSummary; onChanged: () => Promise<void> }) {
  const pid = summary.project.id;
  const load = useLoad(async () => {
    const [candidates, draw, exclusions] = await Promise.all([
      api.GET('/api/v1/committee/candidates').then(unwrap),
      api.GET('/api/v1/projects/{project_id}/committee/draw', { params: { path: { project_id: pid } } }).then(unwrap),
      request<DrawExclusion[]>('GET', `/api/v1/projects/${pid}/committee/exclusions`),
    ]);
    return { candidates, draw, exclusions };
  }, [pid]);
  return <Async load={load} loadingLabel="평가위원 정보를 불러오는 중">
    {({ candidates, draw, exclusions }) => draw
      ? <DrawResult pid={pid} draw={draw} exclusions={exclusions} candidates={candidates} chairId={summary.progress.chair_id}
        onChanged={async () => { await load.reload(); await onChanged(); }} />
      : <DrawSetup pid={pid} candidates={candidates} criteriaConfirmed={summary.criteria.status === 'confirmed'}
        onDrawn={async () => { await load.reload(); await onChanged(); }} />}
  </Async>;
}

function DrawSetup({ pid, candidates, criteriaConfirmed, onDrawn }: { pid: string; candidates: Candidate[]; criteriaConfirmed: boolean; onDrawn: () => Promise<void> }) {
  const [pool, setPool] = useState<string[]>(() => candidates.filter(c => c.active).map(c => c.id));
  const [excluded, setExcluded] = useState<Record<string, string>>({});
  const [seats, setSeats] = useState(5);
  const [reserves, setReserves] = useState(2);
  const [reviewed, setReviewed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const toast = useToast();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  if (!candidates.length) return <Card><Empty title="등록된 평가위원 후보가 없어요" action={<Link className="btn primary" to="/admin/evaluators">후보 등록하러 가기</Link>} /></Card>;

  const eligible = pool.filter(id => !(id in excluded));
  const missingReason = Object.values(excluded).some(r => !r.trim());
  const shortage = eligible.length < seats + reserves;
  const blockReason = seats < 1 ? '본위원은 1명 이상이어야 해요.' : shortage ? '추첨 대상이 모자라서 아직 할 수 없어요.'
    : missingReason ? '제척 사유를 먼저 적어 주세요.' : !reviewed ? '위 확인란에 체크하면 추첨할 수 있어요.' : '';

  async function draw() {
    setBusy(true); setError(null);
    try {
      await request('POST', `/api/v1/projects/${pid}/committee/draw`, {
        candidate_ids: pool, seats, reserves,
        exclusions: Object.entries(excluded).map(([candidate_id, reason]) => ({ candidate_id, reason: reason.trim() })),
      });
      setConfirming(false); await onDrawn(); toast('위원 추첨을 완료했어요.');
    } catch (e) { setError(e); setConfirming(false); } finally { setBusy(false); }
  }

  return <>
    {!criteriaConfirmed && <Notice tone="warning" title="평가기준이 아직 확정되지 않았어요">추첨은 할 수 있지만, 위원은 기준 확정 후에 평가를 시작할 수 있습니다.</Notice>}
    <Card title={<>후보 검토 <span className="count">{eligible.length}명 추첨 대상</span></>}
      actions={<Link to="/admin/evaluators">후보 관리 ›</Link>}>
      <p className="muted">이해관계가 있는 후보는 제척 사유를 적으세요. (제척 기준은 담당자 Lex6won 합의 전 임시)</p>
      <div className="table-wrap"><table className="table">
        <thead><tr><th>포함</th><th>이름</th><th>소속</th><th>전문분야</th><th>제척</th></tr></thead>
        <tbody>{candidates.map(c => {
          const isExcluded = c.id in excluded;
          return <tr key={c.id} className={isExcluded ? 'row-muted' : ''}>
            <td><input type="checkbox" aria-label={`${c.name} 포함`} checked={pool.includes(c.id)} disabled={!c.active || isExcluded}
              onChange={e => { setPool(e.target.checked ? [...pool, c.id] : pool.filter(x => x !== c.id)); setReviewed(false); }} /></td>
            <td>{c.name}</td><td>{c.organization}</td><td>{c.specialty}</td>
            <td>{isExcluded
              ? <div className="row"><input aria-label={`${c.name} 제척 사유`} placeholder="제척 사유 (필수)" value={excluded[c.id]}
                onChange={e => setExcluded({ ...excluded, [c.id]: e.target.value })} />
                <button className="btn sm" onClick={() => { const { [c.id]: _r, ...rest } = excluded; setExcluded(rest); }}>취소</button></div>
              : <button className="btn sm" onClick={() => { setExcluded({ ...excluded, [c.id]: '' }); setReviewed(false); }}>제척</button>}</td>
          </tr>;
        })}</tbody>
      </table></div>
    </Card>
    <Card title="추첨 설정">
      <div className="form-row">
        <label className="field">본위원 수<input type="number" min={1} max={15} value={seats} onChange={e => { setSeats(Number(e.target.value)); setReviewed(false); }} /></label>
        <label className="field">예비위원 수<input type="number" min={0} max={10} value={reserves} onChange={e => { setReserves(Number(e.target.value)); setReviewed(false); }} /></label>
        <div className="field-static"><span>필요 인원</span><strong className={shortage ? 'text-danger' : ''}>{seats + reserves}명 / 가능 {eligible.length}명</strong></div>
      </div>
      {shortage && <Notice tone="danger" title="후보가 부족해요">추첨 대상이 {seats + reserves - eligible.length}명 더 필요합니다. 후보를 추가하거나 인원을 조정하세요.</Notice>}
      {missingReason && <Notice tone="warning" title="제척 사유를 입력해 주세요" />}
      <label className="check"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} />
        후보의 자격·이해관계를 검토했습니다. 추첨은 사업당 한 번만 할 수 있습니다.</label>
      {error !== null && <Notice tone="danger" role="alert" title={describeError(error).title}>{describeError(error).detail}</Notice>}
      <div className="row end">{blockReason && <span className="muted" id="draw-reason">{blockReason}</span>}
        <button className="btn primary" disabled={!!blockReason} aria-describedby={blockReason ? 'draw-reason' : undefined}
          onClick={() => setConfirming(true)}>위원 추첨</button></div>
    </Card>
    <Dialog open={confirming} onClose={() => setConfirming(false)} title="추첨을 진행할까요?" actions={<>
      <button className="btn" onClick={() => setConfirming(false)}>취소</button>
      <button className="btn primary" disabled={busy} onClick={() => void draw()}>{busy ? '추첨 중…' : '추첨 확정'}</button></>}>
      <p>{eligible.length}명 중 본위원 {seats}명, 예비위원 {reserves}명을 무작위로 선정합니다.</p>
      <p className="muted">추첨 결과와 모집단 기록은 바꿀 수 없습니다. 재선정은 별도 절차가 필요합니다.</p>
    </Dialog>
  </>;
}

function DrawResult({ pid, draw, exclusions, candidates, chairId, onChanged }: {
  pid: string; draw: Draw; exclusions: DrawExclusion[]; candidates: Candidate[]; chairId: string | null; onChanged: () => Promise<void>;
}) {
  const [chair, setChair] = useState(chairId ?? '');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const toast = useToast();
  const nameOf = (id: string) => draw.candidate_snapshot.find(c => c.id === id)?.name ?? candidates.find(c => c.id === id)?.name ?? id;

  async function saveChair() {
    setBusy(true); setError(null); setSaved(false);
    try { await request('PUT', `/api/v1/projects/${pid}/committee/chair`, { evaluator_id: chair } satisfies ChairSet); setSaved(true); await onChanged(); toast('위원장 지정을 완료했어요.'); }
    catch (e) { setError(e); } finally { setBusy(false); }
  }

  return <>
    <Card title={<>추첨 결과 <Badge tone="success">확정</Badge></>} actions={<span className="muted">{formatDateTime(draw.created_at)}</span>}>
      <div className="grid-2">
        <div><h3>본위원 {draw.selected_ids.length}명</h3><ol className="member-list">{draw.selected_ids.map(id => <li key={id}>
          {nameOf(id)}{id === chairId && <Badge tone="primary">위원장</Badge>}</li>)}</ol></div>
        <div><h3>예비위원 (순번순)</h3><ol className="member-list">{draw.reserve_ids.map(id => <li key={id}>{nameOf(id)}
          <span className="muted small"> · 평가표 접근 불가</span></li>)}</ol></div>
      </div>
      <details className="record"><summary>추첨 기록 보기</summary>
        <dl className="dl">
          <dt>방법</dt><dd>{draw.method}</dd><dt>모집단</dt><dd>{draw.candidate_snapshot.length}명</dd>
          <dt>모집단 해시</dt><dd className="mono">{draw.snapshot_sha256}</dd>
          <dt>제척</dt><dd>{exclusions.length ? exclusions.map(e => `${nameOf(e.candidate_id)}: ${e.reason}`).join(' / ') : '없음'}</dd>
        </dl>
      </details>
    </Card>
    <Card title="위원장 지정">
      <p className="muted">본위원 중 1명을 골라 주세요. (권한 범위는 담당자 합의 전 mock 가정)</p>
      <div className="form-row">
        <label className="field">위원장<select value={chair} onChange={e => { setChair(e.target.value); setSaved(false); }}>
          <option value="">선택하세요</option>
          {draw.selected_ids.map(id => <option key={id} value={id}>{nameOf(id)}</option>)}
        </select></label>
        <button className="btn primary" disabled={!chair || chair === chairId || busy} onClick={() => void saveChair()}>{busy ? '저장 중…' : '지정'}</button>
      </div>
      {saved && <Notice tone="success" role="status" title={`${nameOf(chair)} 위원을 위원장으로 지정했습니다.`} />}
      {error !== null && <Notice tone="danger" role="alert" title={describeError(error).title}>{describeError(error).detail}</Notice>}
    </Card>
  </>;
}
