import { useState } from 'react';
import { Link } from 'react-router';
import { api, describeError, request, unwrap } from '../../api/client';
import { clearDraft, readDraft } from '../../lib/draft';
import { useSession } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { formatDateTime, formatScore } from '../../lib/format';
import { Async } from '../../ui/states';
import { Card, Dialog, Notice, VendorLabel, useToast } from '../../ui/ui';
import type { Match } from '../../api/contract';
import { readSeen, seenKey } from './Evaluate';
import { useEval } from './EvalProject';

export function SubmitPage() {
  const { project, reload } = useEval();
  const { session } = useSession();
  const params = { path: { project_id: project.id } };
  const load = useLoad(async () => unwrap(await api.GET('/api/v1/projects/{project_id}/evaluations/me', { params })), [project.id]);
  // 근거 열람 참고 줄: 실패하면 숨기고, 제출 가능 여부에는 쓰지 않아요.
  const matches = useLoad(() => request<Match[]>('GET', `/api/v1/projects/${project.id}/matches`), [project.id]);
  const unseen = matches.data ? (() => {
    const seen = readSeen(project.id, session!.user_id);
    const withEv = matches.data.filter(m => m.evidence.length);
    return { total: withEv.length, n: withEv.filter(m => !m.evidence.some(e => seen.has(seenKey(e)))).length };
  })() : null;
  const [attested, setAttested] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const unsaved = readDraft(project.id, session!.user_id);

  return <Async load={load} loadingLabel="평가표를 확인하는 중">
    {sheet => {
      const scoreOf = (v: string, c: string) => sheet?.scores.find(s => s.vendor_id === v && s.criterion_id === c);
      const missing = project.vendor_ids.flatMap(v => project.criteria.map((c, i) => ({ v, c, i }))).filter(x => !scoreOf(x.v, x.c.id));
      const submitted = sheet?.status === 'submitted';
      const ready = !!sheet && !missing.length && !unsaved && !submitted;

      async function submit() {
        if (!sheet) return;
        setBusy(true); setError(null);
        try {
          unwrap(await api.POST('/api/v1/projects/{project_id}/evaluations/me/submit', { params, body: { expected_version: sheet.version, attested: true } }));
          clearDraft(project.id, session!.user_id); setConfirming(false); await load.reload(); await reload(); toast('제출을 마쳤어요.');
        } catch (e) { setError(e); setConfirming(false); } finally { setBusy(false); }
      }

      return <>
        {submitted ? <Notice tone="success" title={`제출 완료 · ${formatDateTime(sheet!.submitted_at)}`}>
          평가표가 잠겼어요. 결과는 전원 제출 후 집계되며, 수정은 간사에게 요청하세요.</Notice>
          : <section className={`submit-verdict ${ready ? 'ready' : 'wait'}`} aria-label="제출 가능 여부">
            <p className="say-title">{ready ? '제출할 준비가 됐어요' : missing.length ? `${missing.length}개를 마치면 제출할 수 있어요` : '저장하면 제출할 수 있어요'}</p>
            <p className="say-sub">{ready ? '제출하면 점수와 의견이 잠겨서 다시 고칠 수 없어요.'
              : !sheet ? '아직 저장한 평가표가 없어요.' : missing.length ? '입력하지 않은 항목이 남아 있어요.' : '저장하지 않은 입력이 있어요.'}</p>
          </section>}
        <Card title="제출 전 점검">
          <ul className="checklist">
            <li className={sheet ? 'ok' : 'bad'}><span aria-hidden="true">{sheet ? '✓' : '✕'}</span>
              {sheet ? '서버에 저장된 평가표가 있어요' : <>아직 저장한 평가표가 없어요 · <Link to="../evaluate">평가하기</Link></>}</li>
            <li className={unsaved && !submitted ? 'bad' : 'ok'}><span aria-hidden="true">{unsaved && !submitted ? '✕' : '✓'}</span>
              {unsaved && !submitted ? <>저장하지 않은 입력이 있어요 · <Link to="../evaluate">평가하기에서 저장</Link></> : '저장하지 않은 입력이 없어요'}</li>
            <li className={missing.length ? 'bad' : 'ok'}><span aria-hidden="true">{missing.length ? '✕' : '✓'}</span>
              {missing.length ? `입력하지 않은 항목 ${missing.length}개` : `모든 항목(${project.criteria.length * project.vendor_ids.length}개) 입력 완료`}</li>
            {unseen && <li className="info"><span aria-hidden="true">ⓘ</span>
              {unseen.n ? `근거를 열어 보지 않은 칸 ${unseen.n}개 · 이 브라우저 기준, 제출에는 영향 없어요` : '모든 근거를 열어 봤어요'}</li>}
          </ul>
          {missing.length > 0 && <ul className="missing-list">{missing.slice(0, 12).map(m => <li key={`${m.v}${m.c.id}`}>
            <Link to={`../evaluate?c=${m.i}`}><VendorLabel id={m.v} /> · {m.c.name}</Link></li>)}
            {missing.length > 12 && <li className="muted">외 {missing.length - 12}개</li>}</ul>}
        </Card>
        {sheet && <Card title="제안사별 기술 점수 합계">
          <div className="stats">{project.vendor_ids.map(v => <div key={v} className="stat">
            <div className="stat-label"><VendorLabel id={v} /></div>
            <div className="stat-value">{formatScore(sheet.scores.filter(s => s.vendor_id === v).reduce((a, s) => a + s.score, 0))}
              <small> / {project.criteria.reduce((a, c) => a + c.max_score, 0)}</small></div>
          </div>)}</div>
          {sheet.opinion ? <p><strong>의견</strong> {sheet.opinion}</p> : <p className="muted">작성한 의견이 없어요 (선택 사항)</p>}
        </Card>}
        {!submitted && <div className="submit-final">
          <label className="check big"><input type="checkbox" checked={attested} disabled={!ready} onChange={e => setAttested(e.target.checked)} />
            <span>본인의 독립적인 판단으로 작성했으며, 제출 후에는 수정할 수 없음을 확인합니다.</span></label>
          {error !== null && <Notice tone="danger" role="alert" title={describeError(error).title}>{describeError(error).detail}</Notice>}
          <div className="cta-bar">
            {(!ready || !attested) && <p className="cta-hint" role="status">{!ready ? '위 점검을 모두 통과하면 제출할 수 있어요' : '확인에 체크하면 제출할 수 있어요'}</p>}
            <button className="btn primary block lg" disabled={!ready || !attested} onClick={() => setConfirming(true)}>최종 제출</button>
          </div>
        </div>}
        <Dialog open={confirming} onClose={() => setConfirming(false)} title="평가표를 제출할까요?" actions={<>
          <button className="btn" onClick={() => setConfirming(false)}>다시 확인</button>
          <button className="btn primary" disabled={busy} onClick={() => void submit()}>{busy ? '제출 중…' : '제출'}</button></>}>
          <p>제출하면 점수와 의견이 잠기고 다시 고칠 수 없어요.</p>
        </Dialog>
      </>;
    }}
  </Async>;
}
