import { Link } from 'react-router';
import { request } from '../../api/client';
import type { Assignment } from '../../api/contract';
import { useSession } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { formatDate } from '../../lib/format';
import { Async, Empty } from '../../ui/states';
import { Badge, PageHeader, type Tone } from '../../ui/ui';

export const sheetLabel: Record<Assignment['sheet_status'], { label: string; tone: Tone }> = {
  not_started: { label: '평가 전', tone: 'neutral' }, draft: { label: '작성 중', tone: 'warning' }, submitted: { label: '제출 완료', tone: 'success' },
};

export function AssignedPage() {
  const { session } = useSession();
  const load = useLoad(() => request<Assignment[]>('GET', '/api/v1/me/assignments'), []);
  return <>
    <PageHeader title={`${session?.name} 위원님, 안녕하세요`} description="참여할 사업을 선택하세요." />
    <Async load={load} loadingLabel="배정된 사업을 불러오는 중"
      empty={list => !list.length && <Empty title="배정된 평가가 없어요">선정되면 이곳에 표시돼요. 문의는 간사에게 해 주세요.</Empty>}>
      {list => <div className="assign-list">{list.map(a => {
        const reserve = a.role === 'reserve';
        const status = reserve ? <Badge>예비위원</Badge> : <Badge tone={sheetLabel[a.sheet_status].tone}>{sheetLabel[a.sheet_status].label}</Badge>;
        const hint = reserve ? '예비위원은 결원 시에만 평가표가 열려요. 지금은 접근할 수 없어요.'
          : !a.criteria_confirmed ? '평가기준이 확정되면 평가를 시작할 수 있어요.'
            : a.sheet_status === 'submitted' ? '제출 내용 보기' : a.sheet_status === 'draft' ? '평가 이어하기' : '평가 시작하기';
        const open = !reserve && a.criteria_confirmed;
        const body = <>
          <div className="assign-main">
            <strong className="assign-title">{a.project_name}</strong>
            <span className="assign-meta">{status}<span className="muted">{a.department} · 평가일 {formatDate(a.evaluation_date)}{a.role === 'chair' && ' · 위원장'}</span></span>
            <span className={open ? 'assign-cta' : 'muted'}>{hint}</span>
          </div>
          {open && <span className="assign-arrow" aria-hidden="true">›</span>}
        </>;
        return reserve || !a.criteria_confirmed
          ? <div key={a.project_id} className="assign-card disabled" aria-disabled="true">{body}</div>
          : <Link key={a.project_id} to={`/eval/projects/${a.project_id}`} className="assign-card">{body}</Link>;
      })}</div>}
    </Async>
  </>;
}
