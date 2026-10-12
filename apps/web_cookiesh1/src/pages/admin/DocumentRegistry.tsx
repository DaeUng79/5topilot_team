import { Link } from 'react-router';
import { useLoad } from '../../lib/useLoad';
import { formatDate } from '../../lib/format';
import { Async, Empty } from '../../ui/states';
import { Badge, Card, PageHeader } from '../../ui/ui';
import { docStatus, loadWorkspace, stageInfo, type Workspace } from './common';
import { DocRow, isPending, usePendingPoll } from './tabs/DocumentsTab';
import { emitAdminChange, useAdminVersion } from './sync';

/** 문서 등록: 진행 중인 모든 사업의 제안요청서·제안서 슬롯을 한 곳에서 올립니다. */
export function DocumentRegistry() {
  const version = useAdminVersion();
  const load = useLoad(async () => (await loadWorkspace()).filter(w => w.summary.progress.stage !== 'confirmed'), [version]);
  usePendingPoll(!!load.data?.some(w => isPending(w.docs)), load.data, load.reload, emitAdminChange);
  return <>
    <PageHeader eyebrow="문서 등록" title="제안요청서·제안서 등록" description="HWPX 파일만 처리해요 · 50MB 이하" />
    <Async load={load} loadingLabel="사업별 문서를 불러오는 중"
      empty={list => !list.length && <Card><Empty title="진행 중인 사업이 없어요" action={<Link className="btn primary" to="/admin/projects?new=1">첫 사업 등록하기</Link>}>
        사업을 등록하면 이곳에서 문서를 올릴 수 있어요.</Empty></Card>}>
      {list => {
        const rows = list.map(w => ({ w, locked: !!w.summary.criteria.locked, ...docStatus(w.summary, w.docs) }));
        const todo = rows.filter(r => !r.locked).reduce((a, r) => a + r.empty, 0);
        rows.sort((a, b) => Number(b.locked ? 0 : b.empty > 0) - Number(a.locked ? 0 : a.empty > 0));
        return <>
          <section className="conclusion" aria-label="문서 현황">
            <span className={`big-num ${todo ? 'warn' : 'ok'}`}>{todo}<small>개</small></span>
            <div>
              <h2 className="say-title">{todo ? `올려야 할 문서가 ${todo}개 있어요` : '모든 문서를 올렸어요'}</h2>
              <p className="say-sub">{todo ? '비어 있는 사업이 위에 있어요. 파일을 올리면 AI가 읽기 시작해요.' : '평가기준은 각 사업의 문서·평가기준에서 확인할 수 있어요.'}</p>
            </div>
          </section>
          {rows.map(({ w, locked, empty }) => <ProjectDocs key={w.summary.project.id} w={w} locked={locked} empty={empty} />)}
        </>;
      }}
    </Async>
  </>;
}

function ProjectDocs({ w, locked, empty }: { w: Workspace; locked: boolean; empty: number }) {
  const { project, progress } = w.summary;
  const slots: { kind: 'rfp' | 'proposal'; vendor: string | null; label: string }[] = [
    { kind: 'rfp', vendor: null, label: '제안요청서' },
    ...project.vendor_ids.map(v => ({ kind: 'proposal' as const, vendor: v, label: `${v} 제안서` })),
  ];
  const firstEmpty = slots.find(sl => !w.docs.some(d => d.kind === sl.kind && d.vendor_id === sl.vendor));
  const stage = stageInfo[progress.stage];
  return <Card className="doc-project" title={<><Link to={`/admin/projects/${project.id}?tab=documents`}>{project.name}</Link> <Badge tone={stage.tone}>{stage.label}</Badge></>}
    actions={<span className="muted">{project.department} · 평가일 {formatDate(progress.evaluation_date)}{!locked && empty > 0 && ` · 비어 있음 ${empty}`}</span>}>
    <ul className="doc-list">{slots.map(slot => <DocRow key={slot.label} pid={project.id} slot={slot}
      doc={w.docs.find(d => d.kind === slot.kind && d.vendor_id === slot.vendor)} locked={locked}
      lockedNote={<span className="doc-locked">평가 중이라 바꿀 수 없어요 · <Link to={`/admin/projects/${project.id}?tab=documents`}>보기</Link></span>}
      highlight={slot === firstEmpty} focused={false} onUploaded={emitAdminChange} />)}</ul>
  </Card>;
}
