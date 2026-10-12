import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api, unwrap } from '../../api/client';
import type { Stage } from '../../api/contract';
import { useLoad } from '../../lib/useLoad';
import { formatDate } from '../../lib/format';
import { Async, Empty } from '../../ui/states';
import { Badge, Card, Dialog, Notice, PageHeader } from '../../ui/ui';
import { describeError } from '../../api/client';
import { loadProjects, loadSummary, stageInfo } from './common';

export function ProjectsPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState<Stage | ''>('');
  const load = useLoad(async () => Promise.all((await loadProjects()).map(loadSummary)), []);
  const creating = params.get('new') === '1';
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true); setError(null);
    try {
      const created = unwrap(await api.POST('/api/v1/projects', { body: { name: String(data.get('name')).trim(), department: String(data.get('department')).trim() } }));
      navigate(`/admin/projects/${created.id}?tab=documents`);
    } catch (err) { setError(err); } finally { setBusy(false); }
  }

  return <>
    <PageHeader eyebrow="사업 관리" title="평가 사업"
      actions={<button className="btn primary" onClick={() => setParams({ new: '1' })}>＋ 새 사업</button>} />
    <Card>
      <div className="filters">
        <label className="field inline"><span className="sr-only">사업명 검색</span>
          <input type="search" placeholder="사업명·부서 검색" value={query} onChange={e => setQuery(e.target.value)} /></label>
        <label className="field inline"><span className="sr-only">단계</span>
          <select value={stage} onChange={e => setStage(e.target.value as Stage | '')}>
            <option value="">전체 단계</option>
            {Object.entries(stageInfo).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select></label>
      </div>
      <Async load={load} loadingLabel="사업 목록을 불러오는 중"
        empty={list => !list.length && <Empty title="등록된 사업이 없어요" action={<button className="btn primary" onClick={() => setParams({ new: '1' })}>사업 등록</button>} />}>
        {list => {
          const rows = list.filter(s => (!stage || s.progress.stage === stage)
            && `${s.project.name} ${s.project.department}`.includes(query.trim()));
          if (!rows.length) return <Empty title="조건에 맞는 사업이 없어요">검색어나 단계를 바꿔 보세요.</Empty>;
          return <div className="table-wrap"><table className="table">
            <thead><tr><th>사업명</th><th>부서</th><th>평가일</th><th>단계</th><th>위원 제출</th><th><span className="sr-only">상세</span></th></tr></thead>
            <tbody>{rows.map(({ project, progress }) => {
              const members = progress.members.filter(m => m.role !== 'reserve');
              return <tr key={project.id}>
                <td><Link to={`/admin/projects/${project.id}`} className="strong-link">{project.name}</Link></td>
                <td>{project.department}</td><td>{formatDate(progress.evaluation_date)}</td>
                <td><Badge tone={stageInfo[progress.stage].tone}>{stageInfo[progress.stage].label}</Badge></td>
                <td>{members.length ? `${members.filter(m => m.sheet_status === 'submitted').length} / ${members.length}` : '-'}</td>
                <td><Link className="btn sm" to={`/admin/projects/${project.id}`}>상세 ›</Link></td>
              </tr>;
            })}</tbody>
          </table></div>;
        }}
      </Async>
    </Card>
    <Dialog open={creating} onClose={() => setParams({})} title="새 사업 등록">
      <form onSubmit={create} className="form">
        <p className="muted">등록 후 제안요청서를 올려 주세요. (mock: 제안사 3개사 고정)</p>
        <label className="field">사업명<input name="name" required maxLength={200} placeholder="예: 정보시스템 구축 사업" autoFocus /></label>
        <label className="field">담당 부서<input name="department" required maxLength={100} placeholder="예: 정보화사업팀" /></label>
        {error !== null && <Notice tone="danger" role="alert" title={describeError(error).title}>{describeError(error).detail}</Notice>}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={() => setParams({})}>취소</button>
          <button className="btn primary" disabled={busy}>{busy ? '등록 중…' : '등록'}</button>
        </div>
      </form>
    </Dialog>
  </>;
}
