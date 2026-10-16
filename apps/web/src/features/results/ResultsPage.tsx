import { useEffect, useState } from 'react';
import { api, unwrap, type Project, type ResultsSummary } from '../../api/client';
import { maxTotal, vendorName } from '../evaluations/EvaluationPage';
import { ReportView, type Report } from './ReportView';
import { ChairSignatureRecord } from './ChairSignature';
import './results.css';

const STATUS_LABEL: Record<ResultsSummary['status'], string> = {
  collecting: '수집 중', technical_complete: '전원 제출 · 확정 대기', confirmed: '위원장 확정', closed: '사업 완료',
};
const MEMBER_LABEL = { none: '미작성', draft: '작성 중', submitted: '제출 · 서명' } as const;

export function ResultsPage({ project }: { project: Project }) {
  const [summary, setSummary] = useState<ResultsSummary | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const params = { path: { project_id: project.id } };

  async function load() {
    setError('');
    try {
      setSummary(unwrap(await api.GET('/api/v1/projects/{project_id}/results/summary', { params })));
    } catch (e) { setError(String(e)); }
  }
  useEffect(() => { void load(); setReport(null); }, [project.id]);

  async function loadReport() {
    setBusy(true); setError('');
    try { setReport(unwrap(await api.GET('/api/v1/projects/{project_id}/results/report', { params }))); }
    catch (e) { setError(String(e)); } finally { setBusy(false); }
  }
  function downloadReport() {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: `report-${project.id}.json` });
    a.click(); URL.revokeObjectURL(url);
  }
  async function close() {
    if (!window.confirm('사업을 완료·보관 처리합니다. 이후 평가기준과 평가표를 변경할 수 없습니다. 계속할까요?')) return;
    setBusy(true); setError('');
    try { unwrap(await api.POST('/api/v1/projects/{project_id}/results/close', { params })); await load(); }
    catch (e) { setError(String(e)); } finally { setBusy(false); }
  }

  const pending = summary ? summary.expected - summary.submitted : 0;
  const sealed = summary?.status === 'confirmed' || summary?.status === 'closed';
  // 위원장은 평가위원 등록·추첨 화면에서 본위원 중 지정한다(committee_draws.chair_id).
  const chairName = summary?.members.find(m => m.is_chair)?.name ?? summary?.chair_id ?? '';

  return <>
    <h1 className="no-print">결과·서명·리포트</h1>
    <p className="muted no-print">평가위원이 제출·서명하면 점수가 모이고, 전원 제출 뒤 위원장이 확인·서명하면 결과가 봉인됩니다.</p>
    {error && <div className="error no-print" role="alert">{error}</div>}
    {summary && <div className="no-print">
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
              <thead><tr><th>순위</th><th>제안사</th><th>기술 평균 / {maxTotal(project)}</th><th>가격</th><th>합계</th></tr></thead>
              <tbody>{summary.rankings.map(r => <tr key={r.vendor_id}>
                <td>{r.rank}</td><td>{vendorName(project, r.vendor_id)}</td><td>{r.technical_average.toFixed(2)}</td>
                <td className="muted">정책 승인 전</td><td className="muted">정책 승인 전</td></tr>)}</tbody>
            </table></div>
          : <p className="muted">선정위원 {pending}명 제출 대기 중입니다. 전원 제출 전에는 점수를 공개하지 않습니다.</p>}
        <ul className="notices">{summary.notices.map(n => <li key={n}>{n}</li>)}</ul>
      </section>

      <section className="panel">
        <h2>1. 위원장 최종 확인</h2>
        {summary.confirmation
          ? <ChairSignatureRecord confirmation={summary.confirmation} chairName={chairName} />
          : <p className="muted">{summary.chair_id == null
              ? '위원장이 지정되지 않았습니다. 평가위원 등록·추첨 화면에서 본위원 중 위원장을 지정하세요.'
              : summary.confirmable ? `위원장(${chairName})이 평가위원 화면에서 결과를 확인하고 서명하면 봉인됩니다.` : `위원장 ${chairName} · ${pending}명 제출 대기 중입니다.`}</p>}
        <p className="dev-note">위원장 서명은 화면에서 작성한 자필 서명 이미지와 결과 스냅샷·해시 기록이며 법적 효력이 있는 전자서명이 아닙니다(로컬 시연용).</p>
      </section>

      <section className="panel">
        <h2>2. 결과표 출력 · 보고서 데이터</h2>
        <p className="muted">확정된 결과 스냅샷에서 매번 다시 만듭니다. HWP·Word 파일 생성은 범위 밖이며 JSON 데이터와 인쇄용 화면을 제공합니다.</p>
        <div className="actions">
          <button disabled={busy || !sealed} onClick={() => void loadReport()}>결과표 보기</button>
          <button disabled={!report} onClick={() => window.print()}>인쇄</button>
          <button disabled={!report} onClick={downloadReport}>보고서 데이터(JSON) 내려받기</button>
        </div>
        {!sealed && <p className="muted">위원장 확정 전에는 결과표를 만들 수 없습니다.</p>}
      </section>

      <section className="panel">
        <h2>3. 사업 완료·보관</h2>
        <p className="muted">위원장 확정과 증빙 일치가 확인된 뒤에만 완료할 수 있습니다. 완료 후에는 조회만 가능합니다.</p>
        <div className="actions">
          <button className="primary" disabled={busy || summary.status !== 'confirmed'} onClick={() => void close()}>사업 완료·보관</button>
          {summary.status === 'closed' && <span className="badge success">완료 · {summary.confirmation?.closed_at}</span>}
        </div>
      </section>
    </div>}
    {report && <ReportView report={report} project={project} />}
  </>;
}
