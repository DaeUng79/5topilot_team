import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ApiError, describeError, sqliteCriteriaRequest } from '../../../api/client';
import type { DocumentRead, SqliteCriteriaRead } from '../../../api/contract';
import { formatDateTime } from '../../../lib/format';
import { Card, Notice } from '../../../ui/ui';
import { projectPath } from '../common';

const REASONS = [
  ['current_status', '사업 관련 현황'],
  ['background_and_need', '추진 배경 및 필요성'],
  ['scope', '사업 범위'],
] as const;

export function SqliteCriteria({ pid, doc }: { pid: string; doc?: DocumentRead }) {
  const [data, setData] = useState<SqliteCriteriaRead | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [requesting, setRequesting] = useState(false);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (!doc) { setData(null); return; }
    let active = true;
    let timer: number | undefined;
    async function load() {
      try {
        const next = await sqliteCriteriaRequest(pid);
        if (!active) return;
        setData(next); setError(null);
        if (next.status === 'queued' || next.status === 'running') timer = window.setTimeout(() => void load(), 2500);
      } catch (caught) { if (active) setError(caught); }
    }
    void load();
    return () => { active = false; window.clearTimeout(timer); };
  }, [pid, doc?.id, doc?.revision, generation]);

  async function generate() {
    setRequesting(true); setError(null);
    try {
      setData(await sqliteCriteriaRequest(pid, true));
      setGeneration(value => value + 1);
    } catch (caught) { setError(caught); }
    finally { setRequesting(false); }
  }

  const aiDisabled = error instanceof ApiError && error.status === 503;
  const result = data?.status === 'done' ? data.result : null;
  const canGenerate = !!doc && !!data?.requirements_ready && (data.status === 'none' || data.status === 'failed') && !aiDisabled;
  return <>
    <Card title="SQLite 평가기준 초안" actions={canGenerate && <button className="btn primary sm" disabled={requesting}
      onClick={() => void generate()}>{requesting ? '요청 중…' : data?.status === 'failed' ? '생성 재시도' : '평가기준 초안 생성'}</button>}>
      {!doc && <p className="muted">제안요청서를 먼저 등록해 주세요.</p>}
      {doc && !data && error === null && <p className="muted" role="status">평가기준 상태를 불러오는 중…</p>}
      {error !== null && <Notice tone={aiDisabled ? 'info' : 'danger'} role="alert"
        title={aiDisabled ? 'AI 평가기준 생성이 비활성화돼 있어요' : describeError(error).title}>
        {aiDisabled ? error.message : describeError(error).detail}
      </Notice>}
      {doc && data && !data.requirements_ready && <Notice tone="warning" title="제안 요구사항이 먼저 필요해요">
        <Link to={projectPath(pid, 'rfp')}>제안요청서 등록 화면에서 요구사항 추출 상태 확인하기</Link>
      </Notice>}
      {(data?.status === 'queued' || data?.status === 'running') && <Notice tone="info" role="status"
        title={data.status === 'queued' ? '평가기준 생성 대기 중' : '평가기준을 생성하는 중'}>
        완료되면 SQLite에 저장된 초안이 자동으로 표시됩니다.
      </Notice>}
      {data?.status === 'failed' && <Notice tone="danger" role="alert" title="평가기준을 생성하지 못했어요">
        {data.error ?? '설정을 확인한 뒤 다시 시도해 주세요.'}
      </Notice>}
      {data?.status === 'none' && data.requirements_ready && !aiDisabled && <p className="muted">
        저장된 평가기준이 없습니다. 초안 생성 시 제안요청서에서 추출한 요구사항을 OpenAI API로 전송합니다.
      </p>}
      {result && <>
        <p className="muted small">생성 시각 {formatDateTime(result.created_at)} · 총 {result.total_score}점 · {result.rows.length}개 항목</p>
        <Notice tone="info" title={result.template_source === 'request_document'
          ? '제안요청서의 정성적 평가표를 반영한 초안입니다'
          : '요구사항 총괄표를 바탕으로 만든 검토용 초안입니다'}>
          {result.template_source === 'request_document'
            ? '원문 항목과 배점을 유지했습니다. 평가기준과 평가요소를 확인해 주세요.'
            : '원문 평가표가 없어 그룹 배점을 100점으로 나눈 초안입니다. 항목과 배점을 확인해 주세요.'}
        </Notice>
        <div className="table-wrap"><table className="table sqlite-criteria-table">
          <thead><tr><th>평가부문</th><th>평가항목</th><th>평가기준</th><th>평가요소</th><th className="num">배점</th></tr></thead>
          <tbody>{result.rows.map(row => <tr key={row.row_id}>
            <td><strong>{row.evaluation_division}</strong><span className="muted small">부문 {row.division_score}점</span></td>
            <td>{row.evaluation_item}</td><td>{row.evaluation_criteria}</td>
            <td><ul>{row.evaluation_elements.map((element, i) => <li key={i}>{element}</li>)}</ul></td>
            <td className="num">{row.score}</td>
          </tr>)}</tbody>
          <tfoot><tr><td colSpan={4}>총점</td><td className="num"><strong>{result.total_score}</strong></td></tr></tfoot>
        </table></div>
      </>}
    </Card>
    {result && <Card title="평가기준 설정 이유">
      {REASONS.map(([key, label]) => <div key={key} className="criteria-reason"><h3>{label}</h3>
        <p>{result.selection_rationale[key]}</p></div>)}
      <h3 className="mini-title">평가부문과의 연결</h3>
      <ul>{result.selection_rationale.evaluation_links.map((link, i) => <li key={i}>
        <strong>{link.evaluation_division}</strong> · {link.reason}</li>)}</ul>
    </Card>}
    {result && <Card title="요구사항 기반 보완 평가항목" actions={<span className="muted small">기본 평가표 총점에 미포함</span>}>
      {result.supplemental_items.length ? result.supplemental_items.map((item, i) => <div key={i} className="criteria-supplement">
        <strong>{item.guideline_area} · {item.evaluation_item}</strong>
        <p>{item.evaluation_criteria}</p>
        <ul>{item.evaluation_elements.map((element, j) => <li key={j}>{element}</li>)}</ul>
        <p className="muted small">원문 근거: {item.source_quote}</p>
      </div>) : <p className="muted">추가로 제안된 보완 항목이 없습니다.</p>}
    </Card>}
    {result && <Notice tone="info" title="평가기준 초안을 검토해 주세요">
      이 화면은 SQLite에 저장된 생성 결과를 보여 줍니다. 사람의 최종 확정 기록은 아직 이 데이터베이스에 저장되지 않습니다.
    </Notice>}
  </>;
}
