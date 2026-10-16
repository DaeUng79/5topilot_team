import { useEffect, useState } from 'react';
import { ApiError, describeError, requirementsRequest } from '../../../api/client';
import type { DocumentRead, RequirementBlock, RequirementsRead } from '../../../api/contract';
import { formatDateTime } from '../../../lib/format';
import { Card, Notice } from '../../../ui/ui';

const BUSINESS = [
  ['current_status', '사업 관련 현황'],
  ['background_and_need', '추진 배경 및 필요성'],
  ['scope', '사업 범위'],
] as const;

function Pages({ pages }: { pages: number[] }) {
  return <span className="muted small">{pages.length ? `원문 ${pages.join(', ')}쪽` : '원문 쪽 미확인'}</span>;
}

function SourceBlocks({ blocks }: { blocks: RequirementBlock[] }) {
  return <div className="requirement-blocks">{blocks.map(block => block.type === 'table'
    ? <div key={block.id} className="requirement-source">
      <p className="muted small">표 · <Pages pages={block.pages} /></p>
      <div className="table-wrap"><table className="table requirement-table"><tbody>
        {block.rows?.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}
          rowSpan={cell.row_span} colSpan={cell.col_span}>{cell.text}</td>)}</tr>)}
      </tbody></table></div>
    </div>
    : <div key={block.id} className="requirement-source"><p className="requirement-text">{block.text}</p><Pages pages={block.pages} /></div>
  )}</div>;
}

export function RfpRequirements({ pid, doc }: { pid: string; doc?: DocumentRead }) {
  const [data, setData] = useState<RequirementsRead | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [retrying, setRetrying] = useState(false);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (!doc) { setData(null); return; }
    let active = true;
    let timer: number | undefined;
    async function load() {
      try {
        const next = await requirementsRequest(pid);
        if (!active) return;
        setData(next);
        setError(null);
        if (next.status === 'queued' || next.status === 'running') timer = window.setTimeout(() => void load(), 2500);
      } catch (caught) { if (active) setError(caught); }
    }
    void load();
    return () => { active = false; window.clearTimeout(timer); };
  }, [pid, doc?.id, doc?.revision, generation]);

  async function retry() {
    setRetrying(true); setError(null);
    try {
      setData(await requirementsRequest(pid, true));
      setGeneration(value => value + 1);
    } catch (caught) { setError(caught); }
    finally { setRetrying(false); }
  }

  const result = data?.status === 'done' ? data.result : null;
  const aiDisabled = error instanceof ApiError && error.status === 503;
  return <Card title="제안 요구사항" actions={!aiDisabled && (data?.status === 'none' || data?.status === 'failed') && doc && <button className="btn sm" disabled={retrying}
    onClick={() => void retry()}>{retrying ? '요청 중…' : data.status === 'none' ? '요구사항 추출' : '추출 재시도'}</button>}>
    {!doc && <p className="muted">제안요청서를 등록하면 사업현황과 요구사항을 추출해 여기에 표시합니다.</p>}
    {doc && !data && error === null && <p className="muted" role="status">요구사항 상태를 불러오는 중…</p>}
    {error !== null && <Notice tone={aiDisabled ? 'info' : 'danger'} role="alert"
      title={aiDisabled ? 'AI 요구사항 추출이 비활성화돼 있어요' : describeError(error).title}>
      {aiDisabled ? error.message : describeError(error).detail}
    </Notice>}
    {(data?.status === 'queued' || data?.status === 'running') && <Notice tone="info" role="status"
      title={data.status === 'queued' ? '요구사항 추출 대기 중' : '요구사항을 추출하는 중'}>
      문서 길이에 따라 시간이 걸릴 수 있습니다. 완료되면 결과가 자동으로 표시됩니다.
    </Notice>}
    {data?.status === 'failed' && <Notice tone="danger" role="alert" title="요구사항을 추출하지 못했어요">
      {data.error ?? '설정을 확인한 뒤 다시 시도해 주세요.'}
    </Notice>}
    {data?.status === 'none' && doc && !aiDisabled && <p className="muted">저장된 요구사항 결과가 없습니다.</p>}
    {result && <>
      <p className="muted small">추출 시각 {formatDateTime(result.created_at)} · 원문과 대조해 확인해 주세요.</p>
      {result.warnings.map((warning, i) => <Notice key={i} tone="warning" title={warning} />)}
      <section className="requirements-section"><h3>1. 사업현황</h3>
        {BUSINESS.map(([key, label]) => <div key={key} className="requirements-group"><h4>{label}</h4>
          {result.business_status[key].length
            ? <ul>{result.business_status[key].map((point, i) => <li key={i}>{point.text} <Pages pages={point.pages} /></li>)}</ul>
            : <p className="muted">원문에서 확인된 내용이 없습니다.</p>}</div>)}
      </section>
      <section className="requirements-section"><h3>2. 요구사항 총괄표</h3>
        {result.requirement_list.length ? <SourceBlocks blocks={result.requirement_list} />
          : <p className="muted">추출된 총괄표가 없습니다.</p>}
      </section>
      <section className="requirements-section"><h3>3. 요구사항 세부 내역 <span className="muted small">{result.details.length}건</span></h3>
        {result.details.length ? <div className="requirements-items">{result.details.map((item, i) => <details key={`${item.label}-${i}`}>
          <summary>{i + 1}. {item.label} <Pages pages={item.pages} /></summary>
          <SourceBlocks blocks={item.blocks} />
        </details>)}</div> : <p className="muted">추출된 세부 내역이 없습니다.</p>}
      </section>
    </>}
  </Card>;
}
