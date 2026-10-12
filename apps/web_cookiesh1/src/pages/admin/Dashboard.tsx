import { Link } from 'react-router';
import { useSession } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { formatDate } from '../../lib/format';
import { Async, Empty } from '../../ui/states';
import { Badge, Card, PageHeader, Progress, StatCard } from '../../ui/ui';
import { loadProjects, loadSummary, stageInfo, todoOf } from './common';

export function Dashboard() {
  const { session } = useSession();
  const load = useLoad(async () => Promise.all((await loadProjects()).map(loadSummary)), []);
  return <>
    <PageHeader eyebrow="대시보드" title={`${session?.name}님, 안녕하세요`}
      actions={<Link className="btn primary" to="/admin/projects?new=1">＋ 새 사업</Link>} />
    <Async load={load} loadingLabel="사업 현황을 불러오는 중"
      empty={list => !list.length && <Card><Empty title="진행 중인 사업이 없어요" action={<Link className="btn primary" to="/admin/projects?new=1">첫 사업 등록하기</Link>}>
        새 사업을 등록하면 이곳에서 단계별 진행 상황을 볼 수 있습니다.</Empty></Card>}>
      {list => {
        const urgency: Record<string, number> = { collecting_done: 0, evaluating: 1, committee: 2, preparing: 3 };
        const todos = list.map(s => ({ s, todo: todoOf(s) })).filter(x => x.todo)
          .sort((a, b) => urgency[a.s.progress.stage] - urgency[b.s.progress.stage]);
        const first = todos[0];
        const evaluating = list.filter(s => s.progress.stage === 'evaluating').length;
        return <>
          <section className="hero" aria-label="오늘 요약">
            <span className={`big-num ${todos.length ? 'warn' : 'ok'}`}>{todos.length}<small>건</small></span>
            <div>
              <h2 className="say-title">{todos.length ? `오늘 처리할 일이 ${todos.length}건 있어요` : '오늘은 처리할 일이 없어요'}</h2>
              {first && <p className="say-sub">가장 먼저 {first.s.project.name}: {first.todo!.text}</p>}
              {first && <Link className="btn primary" to={`/admin/projects/${first.s.project.id}?tab=${first.todo!.tab}`}>지금 하러 가기</Link>}
            </div>
          </section>
          <div className="stats">
            <StatCard label="진행 중 사업" value={`${list.filter(s => s.progress.stage !== 'confirmed').length}건`} />
            <StatCard label="평가 진행" value={`${evaluating}건`} tone="primary" />
          </div>
          {todos.length > 0 && <Card title="처리할 일">
            <ul className="todo-list">{todos.map(({ s, todo }) => <li key={s.project.id}>
              <Badge tone={stageInfo[s.progress.stage].tone}>{stageInfo[s.progress.stage].label}</Badge>
              <div><strong>{s.project.name}</strong><p>{todo!.text}</p></div>
              <Link className="btn ghost sm" to={`/admin/projects/${s.project.id}?tab=${todo!.tab}`}>바로 가기 ›</Link>
            </li>)}</ul>
          </Card>}
          <Card title="진행 중 사업" actions={<Link to="/admin/projects">전체 보기 ›</Link>}>
            <div className="project-cards">{list.map(({ project, progress }) => {
              const members = progress.members.filter(m => m.role !== 'reserve');
              const submitted = members.filter(m => m.sheet_status === 'submitted').length;
              return <Link key={project.id} to={`/admin/projects/${project.id}`} className="project-card">
                <Badge tone={stageInfo[progress.stage].tone}>{stageInfo[progress.stage].label}</Badge>
                <strong>{project.name}</strong>
                <span className="muted">{project.department} · 평가일 {formatDate(progress.evaluation_date)}</span>
                <div className="project-card-foot"><span>제출 {submitted} / {members.length || '-'}</span>
                  <Progress value={submitted} max={members.length} label={`${project.name} 제출 진행률`} /></div>
              </Link>;
            })}</div>
          </Card>
        </>;
      }}
    </Async>
  </>;
}
