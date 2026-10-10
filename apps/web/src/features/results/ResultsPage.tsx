import { useEffect, useState } from 'react';
import { api, unwrap, type Project, type ResultsSummary } from '../../api/client';
import { vendorName } from '../evaluations/EvaluationPage';
import './results.css';

const STATUS_LABEL: Record<ResultsSummary['status'], string> = {
  collecting: '수집 중', technical_complete: '전원 제출 · 확정 대기', confirmed: '위원장 확정', closed: '사업 완료',
};
const MEMBER_LABEL = { none: '미작성', draft: '작성 중', submitted: '제출 · 서명' } as const;

export function ResultsPage({ project }: { project: Project }) {
  const [summary, setSummary] = useState<ResultsSummary | null>(null);
  const [error, setError] = useState('');
  const params = { path: { project_id: project.id } };

  async function load() {
    setError('');
    try {
      setSummary(unwrap(await api.GET('/api/v1/projects/{project_id}/results/summary', { params })));
    } catch (e) { setError(String(e)); }
  }
  useEffect(() => { void load(); }, [project.id]);

  const pending = summary ? summary.expected - summary.submitted : 0;

  return <>
    <h1>결과·서명·리포트</h1>
    <p className="muted">평가위원이 제출·서명하면 점수가 모이고, 전원 제출 뒤 위원장이 확인하면 결과가 봉인됩니다.</p>
    {error && <div className="error" role="alert">{error}</div>}
    {summary && <>
      <section className="panel">
        <div className="section-heading">
          <h2>평가위원 제출 <span className="count" data-testid="results-submitted">{summary.submitted} / {summary.expected}</span></h2>
          <div className="actions"><span className="badge">{STATUS_LABEL[summary.status]}</span><button onClick={() => void load()}>새로고침</button></div>
        </div>
        <div className="chips">{summary.members.map(m =>
          <span key={m.evaluator_id} className={`chip ${m.status}`}>{m.name}{m.is_chair ? ' (위원장)' : ''} · {MEMBER_LABEL[m.status]}</span>)}</div>
        {!summary.members.length && <p className="muted">평가위원 추첨을 먼저 완료하세요.</p>}
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>종합 결과 {summary.status === 'collecting' && <span className="muted">(전원 제출 후 공개)</span>}</h2>
          <span className="muted">{summary.policy_version} · 평가기준 v{summary.criteria_version}</span>
        </div>
        {summary.rankings.length
          ? <div className="table-scroll"><table>
              <thead><tr><th>순위</th><th>제안사</th><th>기술 평균 / 80</th><th>가격</th><th>합계</th></tr></thead>
              <tbody>{summary.rankings.map(r => <tr key={r.vendor_id}>
                <td>{r.rank}</td><td>{vendorName(r.vendor_id)}</td><td>{r.technical_average.toFixed(2)}</td>
                <td className="muted">정책 승인 전</td><td className="muted">정책 승인 전</td></tr>)}</tbody>
            </table></div>
          : <p className="muted">선정위원 {pending}명 제출 대기 중입니다. 전원 제출 전에는 점수를 공개하지 않습니다.</p>}
        <ul className="notices">{summary.notices.map(n => <li key={n}>{n}</li>)}</ul>
      </section>

      <section className="panel">
        <h2>1. 위원장 최종 확인</h2>
        {summary.confirmation
          ? <p>확정 완료 · {summary.confirmation.confirmed_by} · {summary.confirmation.confirmed_at}<br />
              <span className="hash">결과 SHA-256: {summary.confirmation.result_sha256}</span></p>
          : <p className="muted">{summary.chair_id == null
              ? '위원장이 지정되지 않았습니다. 위원 기능(COM-03) 연계 뒤 확정할 수 있습니다.'
              : summary.confirmable ? '위원장이 평가위원 화면에서 결과를 확인하면 봉인됩니다.' : `${pending}명 제출 대기 중입니다.`}</p>}
        <p className="dev-note">확인 기록은 결과 스냅샷과 해시를 저장하는 것이며 법적 전자서명이 아닙니다.</p>
      </section>

      <section className="panel">
        <h2>2. 결과표 출력 · 3. 보고서 초안</h2>
        <p className="muted">5단계에서 연결합니다. 확정된 결과에서 매번 다시 생성하며, HWP 파일 생성은 범위 밖입니다.</p>
        <div className="actions"><button disabled>결과표 인쇄</button><button disabled>보고서 데이터</button></div>
      </section>
    </>}
  </>;
}
