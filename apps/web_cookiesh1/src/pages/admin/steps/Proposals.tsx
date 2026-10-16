import { useState } from 'react';
import { describeError, request } from '../../../api/client';
import type { VendorsSet } from '../../../api/contract';
import { Empty } from '../../../ui/states';
import { Card, Notice, useToast } from '../../../ui/ui';
import { useProjectData } from '../ProjectContext';
import { StepFrame } from '../StepFrame';
import { DocRow } from './docParts';

const MAX_VENDORS = 5;
interface Row { key: string; vendor_id?: string; name: string }

export function ProposalsStep() {
  const { summary, docs, vendors, steps, closed, linked, refresh } = useProjectData();
  const pid = summary.project.id;
  const done = steps.proposalsDone.length;
  const sub = vendors.length ? (steps.done.proposals ? `제안서 ${vendors.length}곳을 모두 올렸어요` : `제안서 ${done}/${vendors.length}곳을 올렸어요`) : '평가할 제안사를 먼저 등록해 주세요';
  // 평가가 시작되면 제안사를 바꿀 수 없습니다(서버 규칙: 409).
  const started = !['preparing', 'committee'].includes(summary.progress.stage) || summary.criteria.locked;
  return <StepFrame step="proposals" sub={sub}>
    {!linked.vendors && <Notice tone="warning" title="제안사 API가 아직 연결되지 않았어요">지금은 기존 제안사 목록만 보여 드려요. 등록·수정은 연결 후에 할 수 있어요.</Notice>}
    <VendorCard key={vendors.map(v => `${v.vendor_id}:${v.code}:${v.name}`).join('|')} pid={pid} vendors={vendors}
      readOnlyReason={closed ? '완료된 사업은 바꿀 수 없어요.' : started ? '평가가 시작되어 제안사를 바꿀 수 없어요.' : !linked.vendors ? '제안사 API가 연결되면 바꿀 수 있어요.' : ''}
      onSaved={refresh} />
    <Card title="제안서 올리기" actions={<span className="muted">업체별 1개 · HWPX만 처리</span>}>
      {vendors.length ? <ul className="doc-list">{vendors.map(v => <DocRow key={v.vendor_id} pid={pid}
        slot={{ kind: 'proposal', vendor: v.vendor_id, label: `${v.code} 제안서`, info: v }}
        doc={docs.find(d => d.kind === 'proposal' && d.vendor_id === v.vendor_id)} locked={closed} highlight={false} focused={false}
        onUploaded={() => void refresh()} />)}</ul>
        : <Empty title="먼저 제안사를 등록해 주세요">위에서 업체명을 입력하면 업체별로 제안서를 올릴 수 있어요.</Empty>}
    </Card>
  </StepFrame>;
}

function VendorCard({ pid, vendors, readOnlyReason, onSaved }: { pid: string; vendors: { vendor_id: string; code: string; name: string }[]; readOnlyReason: string; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const initial: Row[] = vendors.map(v => ({ key: v.vendor_id, vendor_id: v.vendor_id, name: v.name }));
  const [rows, setRows] = useState<Row[]>(initial.length ? initial : []);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const locked = !!readOnlyReason;
  const dirty = JSON.stringify(rows.map(r => [r.vendor_id, r.name.trim()])) !== JSON.stringify(vendors.map(v => [v.vendor_id, v.name]));
  const invalid = rows.some(r => !r.name.trim());
  const codeOf = (r: Row) => vendors.find(v => v.vendor_id === r.vendor_id)?.code;

  async function save() {
    setBusy(true); setError(null);
    try {
      await request('PUT', `/api/v1/projects/${pid}/vendors`, { vendors: rows.map(r => ({ vendor_id: r.vendor_id, name: r.name.trim() })) } satisfies VendorsSet);
      await onSaved(); toast('제안사를 저장했어요.');
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  return <Card title="제안사 등록" actions={<span className="muted">최대 {MAX_VENDORS}곳</span>}>
    <p className="muted">평가위원에게는 A·B·C 코드만 보여요. 업체명은 관리자만 볼 수 있어요.</p>
    <ul className="vendor-edit">{rows.map((r, i) => <li key={r.key}>
      <span className="vendor-code">{codeOf(r) ?? '–'}</span>
      <input aria-label={`제안사 ${i + 1} 업체명`} value={r.name} maxLength={100} placeholder="업체명" disabled={locked}
        onChange={e => setRows(rows.map(x => x.key === r.key ? { ...x, name: e.target.value } : x))} />
      {!locked && <button type="button" className="btn sm" aria-label={`제안사 ${i + 1} 삭제`} onClick={() => setRows(rows.filter(x => x.key !== r.key))}>삭제</button>}
    </li>)}</ul>
    {!rows.length && <p className="muted">등록된 제안사가 없어요.</p>}
    {locked && <p className="muted" role="note">{readOnlyReason}</p>}
    {error !== null && <Notice tone="danger" role="alert" title={describeError(error).title}>{describeError(error).detail}</Notice>}
    {!locked && <div className="row">
      <button type="button" className="btn" disabled={rows.length >= MAX_VENDORS} onClick={() => setRows([...rows, { key: `new-${Date.now()}-${rows.length}`, name: '' }])}>＋ 제안사 추가</button>
      <button type="button" className="btn primary" disabled={!dirty || invalid || busy || !rows.length} onClick={() => void save()}>{busy ? '저장 중…' : '제안사 저장'}</button>
      {dirty && invalid && <span className="muted">업체명을 모두 입력해 주세요</span>}
    </div>}
  </Card>;
}
