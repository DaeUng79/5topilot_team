import type { Project, Results } from '../api/client';
import type { ResultsDetail } from '../api/contract';
import { formatDateTime, formatScore } from '../lib/format';
import { Badge, Card, Notice, VendorLabel } from './ui';

/** 결과 보고 화면(관리자·위원장 공용). 위원장 확인은 전자서명이 아닙니다. */
export function ResultsReport({ project, results, detail }: { project: Project; results: Results; detail: ResultsDetail }) {
  const ranked = [...results.averages].sort((a, b) => b.technical_average - a.technical_average);
  const techMax = project.criteria.reduce((a, c) => a + c.max_score, 0);
  const top = ranked[0];
  return <div className="report">
    {top && <div className="conclusion no-print-gap">
      <span className="big-num">{top.technical_average.toFixed(2)}<small>점</small></span>
      <div><p className="say-title"><VendorLabel id={top.vendor_id} /> 제안서가 기술평가 1위예요</p>
        <p className="say-sub">{detail.confirmation ? '위원장이 결과를 확인했어요.' : '위원장이 확인하면 마무리돼요.'}</p></div>
    </div>}
    <Card title="기술평가 결과" actions={detail.confirmation
      ? <Badge tone="success">위원장 확인 완료</Badge> : <Badge tone="warning">위원장 확인 대기</Badge>}>
      <div className="print-only"><h1>제안서 기술평가 결과</h1><p>{project.name} · {project.department}</p></div>
      <div className="table-wrap"><table className="table">
        <thead><tr><th>순위</th><th>제안사</th><th className="num">기술점수 평균 ({techMax}점 만점)</th></tr></thead>
        <tbody>{ranked.map((r, i) => <tr key={r.vendor_id} className={i === 0 ? 'rank-first' : ''}><td><span className="rank-num">{i + 1}</span></td><td><VendorLabel id={r.vendor_id} /></td>
          <td className="num">{r.technical_average.toFixed(2)}</td></tr>)}</tbody>
      </table></div>
      <p className="muted small">산식: {results.calculation} · 가격 점수·최종 순위는 정책 미확정</p>
    </Card>
    <Card title="위원별 제출 점수 (기술 합계)">
      <div className="table-wrap"><table className="table">
        <thead><tr><th>평가위원</th>{project.vendor_ids.map(v => <th key={v} className="num"><VendorLabel id={v} /></th>)}<th>제출 시각</th></tr></thead>
        <tbody>{detail.members.map(m => <tr key={m.evaluator_id}><td>{m.name}</td>
          {project.vendor_ids.map(v => <td key={v} className="num">{formatScore(m.totals[v] ?? 0)}</td>)}<td>{formatDateTime(m.submitted_at)}</td></tr>)}</tbody>
      </table></div>
    </Card>
    <Card title="확인 기록">
      {detail.confirmation
        ? <p>{detail.confirmation.confirmed_by} 위원장이 {formatDateTime(detail.confirmation.confirmed_at)}에 집계 결과를 확인했습니다.</p>
        : <p className="muted">위원장이 아직 결과를 확인하지 않았습니다.</p>}
      <Notice tone="warning">화면상의 확인 기록이며 전자서명이 아닙니다. 서명·파일 출력은 담당자(u-jing) 범위입니다.</Notice>
    </Card>
    {import.meta.env.VITE_USE_MOCK === '1' && <p className="print-only print-mock">mock 데이터 · 실제 평가 결과 아님 · 전자서명 아님</p>}
  </div>;
}
