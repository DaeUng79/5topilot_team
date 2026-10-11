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
    <PageHeader eyebrow="대시보드" title={`${session?.name}님, 오늘 처리할 일을 확인하세요`}
      actions={<Link className="btn primary" to="/admin/projects?new=1">＋ 새 사업</Link>} />
    <Async load={load} loadingLabel="사업 현황을 불러오는 중"
      empty={list => !list.length && <Card><Empty title="진행 중인 사업이 없어요" action={<Link className="btn primary" to="/admin/projects?new=1">첫 사업 등록하기</Link>}>
        새 사업을 등록하면 이곳에서 단계별 진행 상황을 볼 수 있습니다.</Empty></Card>}>
      {list => {
        const todos = list.map(s => ({ s, todo: todoOf(s) })).filter(x => x.todo);
        const evaluating = list.filter(s => s.progress.stage === 'evaluating').length;
        return <>
          <div className="stats">
            <StatCard label="진행 중 사업" value={`${list.filter(s => s.progress.stage !== 'confirmed').length}건`} />
            <StatCard label="평가 진행" value={`${evaluating}건`} tone="primary" />
            <StatCard label="처리할 일" value={`${todos.length}건`} tone={todos.length ? 'warning' : 'success'} />
          </div>
          {todos.length > 0 && <Card title="처리할 일">
            <ul className="todo-list">{todos.map(({ s, todo }) => <li key={s.project.id}>
              <Badge tone={stageInfo[s.progress.stage].tone}>{stageInfo[s.progress.stage].label}</Badge>
              <div><strong>{s.project.name}</strong><p>{todo!.text}</p></div>
              <Link className="btn sm" to={`/admin/projects/${s.project.id}?tab=${todo!.tab}`}>바로 가기 ›</Link>
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
