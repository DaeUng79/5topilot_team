import { useEffect, useRef, useState } from 'react';
import { describeError, request } from '../../../api/client';
import type { CriteriaConfirm, CriteriaRead, CriterionDraft, DocumentRead, DocumentUpload, JobStatus } from '../../../api/contract';
import { useLoad } from '../../../lib/useLoad';
import { formatDateTime, pageLabel, vendorName } from '../../../lib/format';
import { Async, Empty } from '../../../ui/states';
import { Badge, Card, Dialog, Notice, type Tone } from '../../../ui/ui';
import type { ProjectSummary } from '../common';

const jobInfo: Record<JobStatus, { label: string; tone: Tone }> = {
  queued: { label: '대기 중', tone: 'neutral' }, parsing: { label: '읽는 중', tone: 'info' },
  done: { label: '처리 완료', tone: 'success' }, failed: { label: '처리 실패', tone: 'danger' },
};

export function DocumentsTab({ summary, onChanged }: { summary: ProjectSummary; onChanged: () => Promise<void> }) {
  const pid = summary.project.id;
  const docs = useLoad(() => request<DocumentRead[]>('GET', `/api/v1/projects/${pid}/documents`), [pid]);
  const criteria = useLoad(() => request<CriteriaRead>('GET', `/api/v1/projects/${pid}/criteria`), [pid]);
  const pending = docs.data?.some(d => d.job.status === 'queued' || d.job.status === 'parsing');
  const wasPending = useRef(false);

  // 파싱 작업이 끝날 때까지 상태를 다시 조회합니다.
  useEffect(() => {
    if (!pending) {
      if (wasPending.current) { wasPending.current = false; void criteria.reload(); void onChanged(); }
      return;
    }
    wasPending.current = true;
    const t = setTimeout(() => void docs.reload(), 1500);
    return () => clearTimeout(t);
  }, [pending, docs.data]);

  const slots: { kind: 'rfp' | 'proposal'; vendor: string | null; label: string }[] = [
    { kind: 'rfp', vendor: null, label: '제안요청서' },
    ...summary.project.vendor_ids.map(v => ({ kind: 'proposal' as const, vendor: v, label: `${vendorName(v)} 제안서` })),
  ];

  return <>
    <Card title="원문 문서" actions={<span className="muted">HWPX만 처리 · 50MB 이하</span>}>
      <Async load={docs} loadingLabel="문서 목록을 불러오는 중">
        {list => <ul className="doc-list">{slots.map(slot => {
          const doc = list.find(d => d.kind === slot.kind && d.vendor_id === slot.vendor);
          return <DocRow key={slot.label} pid={pid} slot={slot} doc={doc} locked={slot.kind === 'rfp' && !!criteria.data?.locked}
            onUploaded={() => void docs.reload()} />;
        })}</ul>}
      </Async>
    </Card>
    <Async load={criteria} loadingLabel="평가기준을 불러오는 중">
      {c => <CriteriaReview pid={pid} criteria={c} onConfirmed={async () => { await criteria.reload(); await onChanged(); }} />}
    </Async>
  </>;
}

function DocRow({ pid, slot, doc, locked, onUploaded }: {
  pid: string; slot: { kind: 'rfp' | 'proposal'; vendor: string | null; label: string }; doc?: DocumentRead; locked: boolean; onUploaded: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  async function upload(file: File) {
    setBusy(true); setError(null);
    try {
      // 제안 계약: 실제 서버는 multipart 업로드. mock은 파일 이름·크기만 받습니다.
      await request<DocumentRead>('POST', `/api/v1/projects/${pid}/documents`,
        { kind: slot.kind, vendor_id: slot.vendor, filename: file.name, size: file.size } satisfies DocumentUpload);
      onUploaded();
    } catch (e) { setError(e); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  }
  const job = doc ? jobInfo[doc.job.status] : null;
  return <li className="doc-row">
    <div className="doc-main">
      <strong>{slot.label}</strong>
      {doc ? <span className="muted">{doc.filename} · v{doc.revision} · {formatDateTime(doc.uploaded_at)}</span> : <span className="muted">아직 올리지 않았어요</span>}
      {doc && (doc.job.status === 'queued' || doc.job.status === 'parsing') && <ol className="job-steps" aria-label="처리 단계">
        {(['queued', 'parsing', 'done'] as const).map(s => <li key={s} className={s === doc.job.status ? 'current' : ''}>{jobInfo[s].label}</li>)}
      </ol>}
      {doc?.job.status === 'failed' && <Notice tone="danger" title="처리하지 못했어요">{doc.job.error} 파일을 확인해 다시 올려 주세요.</Notice>}
      {error !== null && <Notice tone="danger" role="alert" title={describeError(error).title}>{describeError(error).detail}</Notice>}
    </div>
    <div className="doc-side" aria-live="polite">
      {job && <Badge tone={job.tone}>{job.label}</Badge>}
      <input ref={input} type="file" accept=".hwpx" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
      <button className="btn sm" disabled={busy || locked} title={locked ? '평가가 시작되어 교체할 수 없습니다' : undefined}
        onClick={() => input.current?.click()}>{busy ? '올리는 중…' : doc ? '새 버전 올리기' : '파일 올리기'}</button>
    </div>
  </li>;
}

function EvidenceChips({ item }: { item: CriterionDraft }) {
  if (!item.evidence.length) return <Badge tone="warning">근거 없음 · 원문 확인 필요</Badge>;
  return <div className="chips">{item.evidence.map(e => <details key={e.block_id} className="chip-detail">
    <summary className={`chip ${e.physical_page === null ? 'warn' : ''}`}>{pageLabel(e.physical_page, e.printed_page)}</summary>
    <p className="excerpt">{e.excerpt}</p>
  </details>)}</div>;
}

function CriteriaReview({ pid, criteria, onConfirmed }: { pid: string; criteria: CriteriaRead; onConfirmed: () => Promise<void> }) {
  const [items, setItems] = useState(criteria.items);
  const [reviewed, setReviewed] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setItems(criteria.items); setReviewed([]); }, [criteria.version]);

  if (criteria.status === 'none') return <Card title="평가기준"><Empty title="평가기준 초안이 아직 없어요">
    제안요청서를 올리면 AI가 항목·배점 후보와 원문 근거를 찾아 초안을 만듭니다. 확정은 사람이 합니다.</Empty></Card>;

  const total = items.reduce((a, i) => a + (Number(i.max_score) || 0), 0);
  const needReview = items.filter(i => i.needs_review && !reviewed.includes(i.id));
  const editable = criteria.status === 'draft';

  async function confirm() {
    setBusy(true); setError(null);
    try {
      await request('POST', `/api/v1/projects/${pid}/criteria/confirm`, {
        expected_version: criteria.version, items: items.map(({ id, area, name, max_score, description }) => ({ id, area, name, max_score, description })),
      } satisfies CriteriaConfirm);
      setConfirming(false); await onConfirmed();
    } catch (e) { setError(e); setConfirming(false); } finally { setBusy(false); }
  }

  return <Card title={<>평가기준 {editable ? <Badge tone="warning">AI 초안 · 검토 필요</Badge> : <Badge tone="success">확정 v{criteria.version}</Badge>}</>}
    actions={!editable && <span className="muted">{criteria.confirmed_by} · {formatDateTime(criteria.confirmed_at)} 확정 · 원본 v{criteria.source_revision}
      {criteria.locked && ' · 평가 시작으로 잠김'}</span>}>
    {editable && <Notice tone="info" title="AI가 찾은 후보입니다. 항목명·배점을 확인하고 필요하면 고친 뒤 확정하세요.">
      근거 칩을 누르면 제안요청서 원문을 볼 수 있습니다. "쪽 미확인" 항목은 원문 위치를 직접 확인해야 합니다.</Notice>}
    <div className="table-wrap"><table className="table">
      <thead><tr><th>영역</th><th>평가항목</th><th className="num">배점</th><th>원문 근거</th>{editable && <th>검토</th>}</tr></thead>
      <tbody>{items.map((item, idx) => <tr key={item.id} className={item.needs_review && !reviewed.includes(item.id) ? 'row-warn' : ''}>
        <td>{item.area}</td>
        <td>{editable ? <input aria-label={`${idx + 1}번 항목명`} value={item.name}
          onChange={e => setItems(items.map(x => x.id === item.id ? { ...x, name: e.target.value } : x))} /> : <strong>{item.name}</strong>}
          <p className="muted small">{item.description}</p></td>
        <td className="num">{editable ? <input className="score-input" type="number" min={1} aria-label={`${item.name} 배점`} value={item.max_score}
          onChange={e => setItems(items.map(x => x.id === item.id ? { ...x, max_score: Number(e.target.value) } : x))} /> : item.max_score}</td>
        <td><EvidenceChips item={item} /></td>
        {editable && <td>{item.needs_review
          ? <label className="check"><input type="checkbox" checked={reviewed.includes(item.id)}
            onChange={e => setReviewed(e.target.checked ? [...reviewed, item.id] : reviewed.filter(x => x !== item.id))} />원문 확인함</label>
          : <span className="muted">-</span>}</td>}
      </tr>)}</tbody>
      <tfoot><tr><td colSpan={2}>합계</td><td className={`num ${total === criteria.technical_total ? '' : 'text-danger'}`}>
        <strong>{total}</strong> / {criteria.technical_total}</td><td colSpan={editable ? 2 : 1}>
        {total !== criteria.technical_total && <span className="text-danger">기술평가 배점({criteria.technical_total}점)과 합계가 달라요</span>}</td></tr></tfoot>
    </table></div>
    {error !== null && <Notice tone="danger" role="alert" title={describeError(error).title}>{describeError(error).detail}</Notice>}
    {editable && <div className="row end">
      {needReview.length > 0 && <span className="muted">원문 확인이 필요한 항목 {needReview.length}개</span>}
      <button className="btn primary" disabled={total !== criteria.technical_total || needReview.length > 0 || items.some(i => !i.name.trim())}
        onClick={() => setConfirming(true)}>평가기준 확정</button>
    </div>}
    <Dialog open={confirming} onClose={() => setConfirming(false)} title="평가기준을 확정할까요?" actions={<>
      <button className="btn" onClick={() => setConfirming(false)}>취소</button>
      <button className="btn primary" disabled={busy} onClick={() => void confirm()}>{busy ? '확정 중…' : '확정'}</button></>}>
      <p>확정한 기준({items.length}개 항목, {total}점)이 평가위원의 평가표에 사용됩니다.</p>
      <p className="muted">평가가 시작되면 기준을 바꿀 수 없습니다. 확정자와 시각이 기록됩니다.</p>
    </Dialog>
  </Card>;
}
