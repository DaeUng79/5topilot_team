import type { Project } from '../../api/client';
import type { components } from '../../api/schema';
import { maxTotal, vendorName } from '../evaluations/EvaluationPage';
import { ChairSignatureRecord } from './ChairSignature';

export type Report = components['schemas']['ReportRead'];

const INTEGRITY = { intact: '일치', mismatch: '불일치', missing: '없음' } as const;

// 확정 스냅샷에서 매번 다시 만든 결과표. 인쇄(window.print) 대상이며 저장하지 않는다.
export function ReportView({ report, project }: { report: Report; project: Pick<Project, 'vendors'> }) {
  return <section className="panel report" aria-label="평가 결과표">
    <h2>{report.project.name} 평가 결과표</h2>
    <p className="muted">{report.project.department} · 생성 {report.generated_at} · 정책 {report.policy_version} · 평가기준 v{report.criteria_version}</p>
    <p className="hash">결과 SHA-256: {report.confirmation.result_sha256} · 스냅샷 {report.snapshot_intact ? '일치' : '불일치'}</p>
    <p>위원장 서명·확정 {report.confirmation.signer_name ?? report.confirmation.confirmed_by} · {report.confirmation.confirmed_at}
      {report.confirmation.closed_at && <> · 사업 완료 {report.confirmation.closed_by} · {report.confirmation.closed_at}</>}</p>

    <h3>종합 순위</h3>
    <div className="table-scroll"><table>
      <thead><tr><th>순위</th><th>제안사</th><th>기술 평균 / {maxTotal(report)}</th></tr></thead>
      <tbody>{report.rankings.map(r => <tr key={r.vendor_id}><td>{r.rank}</td><td>{vendorName(project, r.vendor_id)}</td><td>{r.technical_average.toFixed(2)}</td></tr>)}</tbody>
    </table></div>

    <h3>위원별 평가표</h3>
    <div className="table-scroll"><table>
      <thead><tr><th>평가위원</th>{report.vendor_ids.map(v => <th key={v}>{vendorName(project, v)}</th>)}<th>제출·서명</th><th>증빙</th></tr></thead>
      <tbody>{report.sheets.map(s => <tr key={s.evaluator_id}>
        <td>{s.name}</td>
        {report.vendor_ids.map(v => <td key={v}>{(s.vendor_totals[v] ?? 0).toFixed(2)}</td>)}
        <td>{s.signed_at ?? '—'}<br /><span className="muted">{s.sign_method ?? ''}</span></td>
        <td className={s.integrity === 'intact' ? '' : 'error-text'}>{INTEGRITY[s.integrity]}<br /><span className="hash">{s.sheet_hash?.slice(0, 16)}…</span></td>
      </tr>)}</tbody>
    </table></div>

    <h3>평가기준 (v{report.criteria_version})</h3>
    <div className="table-scroll"><table>
      <thead><tr><th>항목</th><th>배점</th></tr></thead>
      <tbody>{report.criteria.map(c => <tr key={c.id}><td>{c.name}</td><td>{c.max_score}</td></tr>)}</tbody>
    </table></div>

    {report.sheets.some(s => s.opinion) && <>
      <h3>평가 의견</h3>
      <ul className="notices">{report.sheets.filter(s => s.opinion).map(s => <li key={s.evaluator_id}><strong>{s.name}</strong> · {s.opinion}</li>)}</ul>
    </>}
    <h3>평가위원장 서명</h3>
    <ChairSignatureRecord confirmation={report.confirmation} />
    {report.signature_intact === false && <p className="error-text">서명 이미지 해시가 기록과 다릅니다. 저장소 변조 여부를 확인하세요.</p>}
    <ul className="notices">{report.notices.map(n => <li key={n}>{n}</li>)}</ul>
  </section>;
}
