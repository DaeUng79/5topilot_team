import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { describeError, request } from '../../api/client';
import type { AskAnswer, Citation, DocumentContent, DocumentRead } from '../../api/contract';
import { useLoad } from '../../lib/useLoad';
import { pageLabel, vendorName } from '../../lib/format';
import { Async, Empty, Loading } from '../../ui/states';
import { Badge, Card, Notice } from '../../ui/ui';
import { useEval } from './EvalProject';

const statusInfo = { answered: null, no_evidence: { tone: 'warning', title: '근거를 찾지 못했어요' },
  conflict: { tone: 'warning', title: '문서마다 내용이 달라요' }, refused: { tone: 'info', title: '챗봇이 할 수 없는 요청이에요' } } as const;

export function DocsPage() {
  const { project } = useEval();
  const [params, setParams] = useSearchParams();
  const docs = useLoad(() => request<DocumentRead[]>('GET', `/api/v1/projects/${project.id}/documents`), [project.id]);
  const ready = docs.data?.filter(d => d.job.status === 'done') ?? [];
  const keyOf = (d: DocumentRead) => d.vendor_id ?? 'rfp';
  const docKey = params.get('doc') ?? (ready[0] ? keyOf(ready[0]) : '');
  const activeDoc = ready.find(d => keyOf(d) === docKey) ?? ready[0];
  const block = params.get('block');

  function open(key: string, blockId?: string) {
    const next = new URLSearchParams(params);
    next.set('doc', key); if (blockId) next.set('block', blockId); else next.delete('block');
    setParams(next, { replace: true });
  }

  return <div className="docs-layout">
    <section className="docs-viewer" aria-label="원문 보기">
      <Async load={docs} loadingLabel="문서 목록을 불러오는 중"
        empty={() => !ready.length && <Card><Empty title="볼 수 있는 문서가 아직 없어요">간사가 문서를 올리고 처리가 끝나면 표시됩니다.</Empty></Card>}>
        {() => <>
          <div className="doc-tabs" role="tablist">{ready.map(d => <button key={d.id} role="tab" aria-selected={d === activeDoc}
            className={d === activeDoc ? 'active' : ''} onClick={() => open(keyOf(d))}>{d.kind === 'rfp' ? '제안요청서' : vendorName(d.vendor_id!)}</button>)}</div>
          {activeDoc && <DocumentView key={activeDoc.id} projectId={project.id} doc={activeDoc} highlight={block} />}
        </>}
      </Async>
    </section>
    <AskPanel projectId={project.id} vendorIds={project.vendor_ids} onCite={c => {
      const d = ready.find(x => x.id === c.document_id); if (d) open(keyOf(d), c.block_id);
    }} autoFocus={params.get('ask') === '1'} />
  </div>;
}

function DocumentView({ projectId, doc, highlight }: { projectId: string; doc: DocumentRead; highlight: string | null }) {
  const load = useLoad(() => request<DocumentContent>('GET', `/api/v1/projects/${projectId}/documents/${doc.id}`), [projectId, doc.id]);
  const refs = useRef<Record<string, HTMLElement | null>>({});
  useEffect(() => {
    const el = highlight ? refs.current[highlight] : null;
    if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.focus({ preventScroll: true }); }
  }, [highlight, load.data]);
  return <Async load={load} loadingLabel="원문을 불러오는 중">
    {content => <article className="doc-page">
      <header className="doc-meta"><strong>{content.label}</strong><span className="muted">{doc.filename} · v{doc.revision}</span></header>
      {content.blocks.map(b => <section key={b.block_id} ref={el => { refs.current[b.block_id] = el; }} tabIndex={-1}
        className={`doc-block ${highlight === b.block_id ? 'highlight' : ''}`} aria-label={`${b.heading ?? ''} ${pageLabel(b.physical_page, b.printed_page)}`}>
        <div className="doc-block-meta"><span className={`chip ${b.physical_page === null ? 'warn' : ''}`}>{pageLabel(b.physical_page, b.printed_page)}</span></div>
        {b.heading && <h3>{b.heading}</h3>}<p>{b.text}</p>
      </section>)}
    </article>}
  </Async>;
}

function AskPanel({ projectId, vendorIds, onCite, autoFocus }: { projectId: string; vendorIds: string[]; onCite: (c: Citation) => void; autoFocus: boolean }) {
  const [scope, setScope] = useState('all');
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<{ q: string; a?: AskAnswer; error?: unknown }[]>([]);
  const [busy, setBusy] = useState(false);
  async function ask(e: FormEvent) {
    e.preventDefault();
    const q = question.trim(); if (!q) return;
    setBusy(true); setQuestion('');
    setHistory(h => [...h, { q }]);
    try {
      const a = await request<AskAnswer>('POST', `/api/v1/projects/${projectId}/ask`, { question: q, scope });
      setHistory(h => h.map((x, i) => i === h.length - 1 ? { ...x, a } : x));
    } catch (error) { setHistory(h => h.map((x, i) => i === h.length - 1 ? { ...x, error } : x)); }
    finally { setBusy(false); }
  }
  return <aside className="ask-panel" aria-label="문서에 질문하기">
    <div className="ask-head"><strong>문서에 질문하기</strong><span className="muted small">이 사업의 문서 안에서만 답하고 출처 쪽을 함께 보여 드려요.</span></div>
    <div className="ask-log" aria-live="polite">
      {!history.length && <p className="muted">예: 하자보수 기간은 어떻게 되나요?</p>}
      {history.map((h, i) => <div key={i} className="ask-item">
        <p className="ask-q">{h.q}</p>
        {!h.a && !h.error && <Loading label="찾는 중" rows={1} />}
        {h.error !== undefined && <Notice tone="danger" title={describeError(h.error).title}>{describeError(h.error).detail}</Notice>}
        {h.a && <div className="ask-a">
          {statusInfo[h.a.status] && <Badge tone={statusInfo[h.a.status]!.tone}>{statusInfo[h.a.status]!.title}</Badge>}
          <p>{h.a.answer.split('\n').map((l, j) => <span key={j}>{l}<br /></span>)}</p>
          {h.a.citations.length > 0 && <div className="chips">{h.a.citations.map(c => <button key={c.document_id + c.block_id} className={`chip ${c.physical_page === null ? 'warn' : ''}`}
            onClick={() => onCite(c)} title="원문에서 보기">{c.label} · {pageLabel(c.physical_page, c.printed_page)}</button>)}</div>}
        </div>}
      </div>)}
    </div>
    <p className="muted small">답변의 출처가 내용을 뒷받침하는지 반드시 원문에서 확인해 주세요. 챗봇은 점수를 입력·제출할 수 없습니다.</p>
    <form className="ask-form" onSubmit={ask}>
      <label className="field inline"><span className="sr-only">검색 범위</span><select value={scope} onChange={e => setScope(e.target.value)}>
        <option value="all">이 사업 전체 문서</option><option value="rfp">제안요청서만</option>
        {vendorIds.map(v => <option key={v} value={v}>{vendorName(v)} 제안서</option>)}
      </select></label>
      <div className="row"><label className="field grow"><span className="sr-only">질문</span>
        <input value={question} onChange={e => setQuestion(e.target.value)} placeholder="질문을 입력하세요" autoFocus={autoFocus} /></label>
        <button className="btn primary" disabled={busy || !question.trim()}>질문</button></div>
    </form>
  </aside>;
}
