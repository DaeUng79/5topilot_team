import { Link } from 'react-router';
import { api, unwrap } from '../../api/client';
import { useLoad } from '../../lib/useLoad';
import { formatDate, formatDateTime, vendorName } from '../../lib/format';
import { Async } from '../../ui/states';
import { Card, Notice, Progress, VendorLabel } from '../../ui/ui';
import { useEval } from './EvalProject';

/** 결론 먼저: 남은 항목 수 → 다음 할 일 버튼 하나 → 제안사별 진행. */
export function EvalHome() {
  const { project, assignment } = useEval();
  const load = useLoad(async () => unwrap(await api.GET('/api/v1/projects/{project_id}/evaluations/me', { params: { path: { project_id: project.id } } })), [project.id]);
  const perVendor = project.criteria.length;
  return <Async load={load} loadingLabel="내 평가표를 불러오는 중">
    {sheet => {
      const filled = (v: string) => sheet?.scores.filter(s => s.vendor_id === v).length ?? 0;
      const all = perVendor * project.vendor_ids.length;
      const left = all - project.vendor_ids.reduce((a, v) => a + filled(v), 0);
      const submitted = sheet?.status === 'submitted';
      const next = submitted ? { to: 'evaluate', text: '제출한 평가 보기' } : left > 0 ? { to: 'evaluate', text: sheet ? '이어서 평가하기' : '평가 시작하기' } : { to: 'submit', text: '제출하러 가기' };
      return <div className="eval-home">
        <section className="home-hero" aria-label="요약">
          {submitted ? <>
            <p className="say-title">제출을 마쳤어요</p>
            <p className="say-sub">{formatDateTime(sheet?.submitted_at)}에 제출했어요.</p></>
            : left > 0 ? <>
              <p className="home-line"><span className="big-num">{left}</span><span className="say-title">개 항목 남았어요</span></p>
              <p className="say-sub">제안서 {project.vendor_ids.length}건 · 평가항목 {perVendor}개 · 평가일 {formatDate(assignment.evaluation_date)}</p></>
              : <>
                <p className="say-title">모든 항목을 입력했어요</p>
                <p className="say-sub">제출 전 점검만 마치면 끝나요.</p></>}
        </section>
        {submitted && <Notice tone="success" title="제출 후에는 수정할 수 없어요">수정은 간사에게 요청하세요.</Notice>}
        <Card title="제안사별 진행">
          <ul className="vendor-progress">{project.vendor_ids.map(v => <li key={v}>
            <VendorLabel id={v} />
            <Progress value={filled(v)} max={perVendor} label={`${vendorName(v)} 작성 진행률`} />
            <span className="muted">{filled(v)} / {perVendor} 항목</span>
          </li>)}</ul>
        </Card>
        <div className="cta-bar"><Link className="btn primary lg" to={next.to}>{next.text} ›</Link></div>
        <p className="home-links"><Link to="docs?ask=1">문서에 질문하기</Link><span className="muted"> · 답변에 출처 쪽이 표시돼요</span></p>
      </div>;
    }}
  </Async>;
}
