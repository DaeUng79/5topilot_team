import { useState } from 'react';
import { api, describeError, request, unwrap } from '../../api/client';
import type { ResultsConfirm, ResultsDetail } from '../../api/contract';
import { useLoad } from '../../lib/useLoad';
import { ResultsReport } from '../../ui/ResultsReport';
import { Async, Forbidden } from '../../ui/states';
import { Card, Dialog, Notice, useToast } from '../../ui/ui';
import { Locked } from '../admin/steps/Results';
import { useEval } from './EvalProject';

/** 위원장 확인: 전원 제출 후 집계 결과를 보고 확인 기록을 남깁니다(전자서명 아님). 권한 범위는 mock 가정. */
export function ChairPage() {
  const { project, assignment } = useEval();
  const load = useLoad(async () => {
    const results = unwrap(await api.GET('/api/v1/projects/{project_id}/results', { params: { path: { project_id: project.id } } }));
    const detail = results.status === 'technical_complete' ? await request<ResultsDetail>('GET', `/api/v1/projects/${project.id}/results/detail`) : null;
    return { results, detail };
  }, [project.id]);
  const [attested, setAttested] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  if (assignment.role !== 'chair') return <Forbidden detail="위원장만 볼 수 있는 화면입니다." />;

  async function confirm() {
    setBusy(true); setError(null);
    try { await request('POST', `/api/v1/projects/${project.id}/results/confirm`, { attested: true } satisfies ResultsConfirm); setOpen(false); await load.reload(); toast('결과 확인을 기록했어요.'); }
    catch (e) { setError(e); setOpen(false); } finally { setBusy(false); }
  }

  return <Async load={load} loadingLabel="집계 결과를 불러오는 중">
    {({ results, detail }) => !detail ? <Locked results={results} onRefresh={() => void load.reload()} /> : <>
      <Notice tone="info" title="위원장 확인 권한은 담당자(u-jing·Lex6won) 합의 전 mock 가정입니다." />
      <ResultsReport project={project} results={results} detail={detail} />
      {!detail.confirmation && <Card title="결과 확인">
        <label className="check big"><input type="checkbox" checked={attested} onChange={e => setAttested(e.target.checked)} />
          <span>위원별 제출 점수와 집계 결과를 확인했습니다.</span></label>
        {error !== null && <Notice tone="danger" role="alert" title={describeError(error).title}>{describeError(error).detail}</Notice>}
        <div className="row end"><button className="btn primary" disabled={!attested} onClick={() => setOpen(true)}>결과 확인 기록</button></div>
      </Card>}
      <Dialog open={open} onClose={() => setOpen(false)} title="결과 확인을 기록할까요?" actions={<>
        <button className="btn" onClick={() => setOpen(false)}>취소</button>
        <button className="btn primary" disabled={busy} onClick={() => void confirm()}>{busy ? '기록 중…' : '확인 기록'}</button></>}>
        <p>확인한 시각과 위원장 이름이 기록됩니다. 이 기록은 전자서명이 아닙니다.</p>
      </Dialog>
    </>}
  </Async>;
}
