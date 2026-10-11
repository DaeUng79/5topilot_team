import type { Project, Results } from '../api/client';
import type { ResultsDetail } from '../api/contract';
import { formatDateTime, formatScore, vendorName } from '../lib/format';
import { Badge, Card, Notice } from './ui';

/** 결과 보고 화면(관리자·위원장 공용). 위원장 확인은 전자서명이 아닙니다. */
export function ResultsReport({ project, results, detail }: { project: Project; results: Results; detail: ResultsDetail }) {
  const ranked = [...results.averages].sort((a, b) => b.technical_average - a.technical_average);
  const techMax = project.criteria.reduce((a, c) => a + c.max_score, 0);
  return <div className="report">
    <Card title="기술평가 결과" actions={detail.confirmation
      ? <Badge tone="success">위원장 확인 완료</Badge> : <Badge tone="warning">위원장 확인 대기</Badge>}>
      <div className="print-only"><h1>제안서 기술평가 결과</h1><p>{project.name} · {project.department}</p></div>
      <div className="table-wrap"><table className="table">
        <thead><tr><th>순위</th><th>제안사</th><th className="num">기술점수 평균 ({techMax}점 만점)</th></tr></thead>
        <tbody>{ranked.map((r, i) => <tr key={r.vendor_id}><td>{i + 1}</td><td><strong>{vendorName(r.vendor_id)}</strong></td>
          <td className="num">{r.technical_average.toFixed(2)}</td></tr>)}</tbody>
      </table></div>
      <p className="muted small">산식: {results.calculation}. 가격 점수와 최종 순위는 정책 확정 후 별도 처리합니다.</p>
    </Card>
    <Card title="위원별 제출 점수 (기술 합계)">
      <div className="table-wrap"><table className="table">
        <thead><tr><th>평가위원</th>{project.vendor_ids.map(v => <th key={v} className="num">{vendorName(v)}</th>)}<th>제출 시각</th></tr></thead>
        <tbody>{detail.members.map(m => <tr key={m.evaluator_id}><td>{m.name}</td>
          {project.vendor_ids.map(v => <td key={v} className="num">{formatScore(m.totals[v] ?? 0)}</td>)}<td>{formatDateTime(m.submitted_at)}</td></tr>)}</tbody>
      </table></div>
    </Card>
    <Card title="확인 기록">
      {detail.confirmation
        ? <p>{detail.confirmation.confirmed_by} 위원장이 {formatDateTime(detail.confirmation.confirmed_at)}에 집계 결과를 확인했습니다.</p>
        : <p className="muted">위원장이 아직 결과를 확인하지 않았습니다.</p>}
      <Notice tone="warning">이 확인 기록은 화면상의 확인이며 전자서명이 아닙니다. 서명·보고서 파일 출력은 담당자(u-jing) 구현 범위입니다.</Notice>
    </Card>
    {import.meta.env.VITE_USE_MOCK === '1' && <p className="print-only print-mock">mock 데이터 · 실제 평가 결과 아님 · 전자서명 아님</p>}
  </div>;
}
