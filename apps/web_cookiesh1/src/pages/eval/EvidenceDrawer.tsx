import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { ApiError, request } from '../../api/client';
import type { DocumentContent, DocumentRead, Evidence } from '../../api/contract';
import { pageLabel } from '../../lib/format';
import { useLoad } from '../../lib/useLoad';
import { ErrorState, Loading } from '../../ui/states';

/** 평가 화면을 떠나지 않고 근거 원문을 보는 오른쪽 서랍. 비모달이라 뒤 화면(저장 바 등)을 계속 쓸 수 있어요. */
export function EvidenceDrawer({ projectId, evidence, nonce = 0, onClose }: { projectId: string; evidence: Evidence; nonce?: number; onClose: () => void }) {
  const load = useLoad(async () => {
    const docs = await request<DocumentRead[]>('GET', `/api/v1/projects/${projectId}/documents`);
    const doc = docs.find(d => d.id === evidence.document_id);
    if (!doc) throw new ApiError(404, '근거가 있는 문서를 찾지 못했어요. 자료 보기에서 직접 확인해 주세요.');
    const content = await request<DocumentContent>('GET', `/api/v1/projects/${projectId}/documents/${doc.id}`);
    return { doc, content };
  }, [projectId, evidence.document_id]);
  const panel = useRef<HTMLElement>(null);
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const closeRef = useRef(onClose); closeRef.current = onClose;

  // 열릴 때 서랍으로 포커스를 옮기고, Esc로 닫아요.
  useEffect(() => {
    panel.current?.focus();
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); closeRef.current(); } };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  // 근거 블록으로 스크롤하고 포커스를 옮겨요.
  useEffect(() => {
    const el = refs.current[evidence.block_id];
    if (!el || load.data?.doc.id !== evidence.document_id) return;
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' }); el.focus({ preventScroll: true });
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  }, [evidence.block_id, evidence.document_id, load.data, nonce]);

  const doc = load.data?.doc;
  const docKey = doc ? (doc.kind === 'rfp' ? 'rfp' : doc.vendor_id) : null;
  return <aside ref={panel} className="evidence-drawer" role="dialog" aria-modal="false" aria-labelledby="evidence-title" tabIndex={-1}>
    <header className="ev-head">
      <div><div className="eyebrow">근거 원문</div>
        <h2 id="evidence-title">{load.data ? load.data.content.label : '근거 원문을 불러오는 중'}</h2>
        {doc && <span className="muted small">{doc.filename} · v{doc.revision}</span>}</div>
      <button type="button" className="btn sm ev-close" onClick={onClose} aria-label="근거 원문 닫기 (Esc)">✕ 닫기</button>
    </header>
    <div className="ev-body">
      {load.data === undefined
        ? (load.state === 'error' ? <ErrorState error={load.error} onRetry={() => void load.reload()} /> : <Loading label="원문을 불러오는 중" />)
        : load.data.content.blocks.map(b => {
          const hit = b.block_id === evidence.block_id;
          return <section key={b.block_id} ref={el => { refs.current[b.block_id] = el; }} tabIndex={-1} className={`ev-block ${hit ? 'hit' : ''}`} onAnimationEnd={e => e.currentTarget.classList.remove('flash')}
            aria-label={`${hit ? '근거 위치 ' : ''}${b.heading ?? ''} ${pageLabel(b.physical_page, b.printed_page)}`.trim()}>
            <div className="ev-meta"><span className={`chip ${b.physical_page === null ? 'warn' : ''}`}>{pageLabel(b.physical_page, b.printed_page)}</span>
              {hit && <span className="ev-hit-mark">▶ 근거 위치</span>}</div>
            {b.heading && <h3>{b.heading}</h3>}<p>{b.text}</p>
          </section>;
        })}
    </div>
    {docKey && <footer className="ev-foot"><Link className="btn sm" to={`../docs?doc=${docKey}&block=${evidence.block_id}`}>자료 보기에서 크게 보기</Link></footer>}
  </aside>;
}
