import { Link } from 'react-router';
import { api, unwrap } from '../../api/client';
import { useLoad } from '../../lib/useLoad';
import { formatDate, formatDateTime, vendorName } from '../../lib/format';
import { Async } from '../../ui/states';
import { Badge, Card, Notice, Progress, VendorLabel } from '../../ui/ui';
import { sheetLabel } from './Assigned';
import { useEval } from './EvalProject';

export function EvalHome() {
  const { project, assignment } = useEval();
  const load = useLoad(async () => unwrap(await api.GET('/api/v1/projects/{project_id}/evaluations/me', { params: { path: { project_id: project.id } } })), [project.id]);
  const perVendor = project.criteria.length;
  return <Async load={load} loadingLabel="내 평가표를 불러오는 중">
    {sheet => {
      const filled = (v: string) => sheet?.scores.filter(s => s.vendor_id === v).length ?? 0;
      const total = project.vendor_ids.reduce((a, v) => a + filled(v), 0);
      const status = sheet?.status === 'submitted' ? 'submitted' : sheet ? 'draft' : 'not_started';
      return <>
        <div className="stats">
          <div className="stat"><div className="stat-label">평가일</div><div className="stat-value sm">{formatDate(assignment.evaluation_date)}</div></div>
          <div className="stat"><div className="stat-label">제안서 · 평가항목</div><div className="stat-value sm">{project.vendor_ids.length}건 · {perVendor}개</div></div>
          <div className="stat"><div className="stat-label">내 진행</div><div className="stat-value sm">{total} / {perVendor * project.vendor_ids.length}</div>
            <Badge tone={sheetLabel[status].tone}>{sheetLabel[status].label}</Badge></div>
        </div>
        {sheet?.status === 'submitted' && <Notice tone="success" title={`${formatDateTime(sheet.submitted_at)}에 제출했습니다.`}>
          제출 후에는 수정할 수 없어요. 수정은 간사에게 요청하세요.</Notice>}
        <Card title="제안사별 진행">
          <ul className="vendor-progress">{project.vendor_ids.map(v => <li key={v}>
            <VendorLabel id={v} />
            <Progress value={filled(v)} max={perVendor} label={`${vendorName(v)} 작성 진행률`} />
            <span className="muted">{filled(v)} / {perVendor} 항목</span>
          </li>)}</ul>
          <div className="row end"><Link className="btn primary" to="evaluate">{sheet?.status === 'submitted' ? '제출한 평가 보기' : sheet ? '평가 이어하기' : '평가 시작하기'} ›</Link></div>
        </Card>
        <div className="tool-cards">
          <Link to="docs?doc=rfp" className="tool-card"><strong>제안요청서 보기</strong><span>평가 기준 확인</span></Link>
          <Link to="docs" className="tool-card"><strong>제안서 보기</strong><span>업체별 원문</span></Link>
          <Link to="docs?ask=1" className="tool-card"><strong>문서에 질문하기</strong><span>답변에 출처 쪽 표시</span></Link>
          {assignment.role === 'chair' && <Link to="chair" className="tool-card accent"><strong>위원장 확인</strong><span>전원 제출 후 집계 확인</span></Link>}
        </div>
      </>;
    }}
  </Async>;
}
