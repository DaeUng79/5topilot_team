import { useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useSearchParams } from 'react-router';
import { api, request, unwrap, type Project } from '../../api/client';
import type { Assignment, DocumentRead, JobStatus } from '../../api/contract';
import { useLoad } from '../../lib/useLoad';
import { vendorName } from '../../lib/format';
import { VendorDot } from '../../ui/ui';

/* 평가위원 왼쪽 칸: 왼쪽=이동, 가운데=작업. 문서는 읽기 전용 목록(등록·업로드는 간사 업무). */
const STORE = 'simsa-rail';
type Pref = { evaluate?: boolean; other?: boolean };
const readPref = (): Pref => { try { return JSON.parse(localStorage.getItem(STORE) ?? '{}') as Pref; } catch { return {}; } };

const docStatus: Record<JobStatus, string> = { done: '완료', queued: '처리 중', parsing: '처리 중', failed: '실패' };
const keyOf = (d: DocumentRead) => d.vendor_id ?? 'rfp';

const Icon = ({ d }: { d: string }) => <svg className="rail-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor"
  strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
const ICONS = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  docs: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  send: 'M21 3L10 14M21 3l-7 18-4-7-7-4z',
  chair: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  back: 'M15 5l-7 7 7 7',
  fold: 'M11 6l-6 6 6 6M19 6l-6 6 6 6',
  doc: 'M7 3h7l5 5v13H7zM14 3v5h5',
} as const;

export function EvalRail({ project, assignment, children }: { project: Project; assignment: Assignment; children: ReactNode }) {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const onEvaluate = /\/evaluate\/?$/.test(pathname);
  const [pref, setPref] = useState<Pref>(readPref);
  const collapsed = onEvaluate ? pref.evaluate ?? true : pref.other ?? false;
  function toggle() {
    const next: Pref = { ...readPref(), [onEvaluate ? 'evaluate' : 'other']: !collapsed };
    setPref(next);
    try { localStorage.setItem(STORE, JSON.stringify(next)); } catch { /* 저장소를 못 써도 화면은 동작 */ }
  }

  // 목록·진행은 참고용이라 실패하면 조용히 비워 둬요. 이동할 때마다 다시 읽어 진행이 늦지 않게 해요.
  const docs = useLoad(() => request<DocumentRead[]>('GET', `/api/v1/projects/${project.id}/documents`), [project.id]);
  const sheet = useLoad(async () => unwrap(await api.GET('/api/v1/projects/{project_id}/evaluations/me', { params: { path: { project_id: project.id } } })), [project.id, pathname]);
  const list = [...(docs.data ?? [])].sort((a, b) => Number(a.kind !== 'rfp') - Number(b.kind !== 'rfp') || keyOf(a).localeCompare(keyOf(b)));
  const perVendor = project.criteria.length;
  const docParam = pathname.endsWith('/docs') ? params.get('doc') : null;

  const steps: [string, string, string, boolean][] = [
    ['.', '평가 홈', ICONS.home, true], ['docs', '자료 보기', ICONS.docs, false], ['evaluate', '평가하기', ICONS.edit, false], ['submit', '제출', ICONS.send, false],
  ];
  if (assignment.role === 'chair') steps.push(['chair', '위원장 확인', ICONS.chair, false]);

  return <div className={`eval-frame${collapsed ? ' rail-collapsed' : ''}`}>
    <aside className="rail" aria-label="평가 이동">
      <Link to="/eval" className="rail-back" aria-label="배정된 평가로 돌아가기" title="배정된 평가"><Icon d={ICONS.back} /><span className="rail-label">배정된 평가</span></Link>
      <nav className="rail-steps" aria-label="평가 메뉴">
        {steps.map(([to, label, d, end]) => <NavLink key={to} to={to} end={end} className="rail-link" aria-label={label} title={label}>
          <Icon d={d} /><span className="rail-label">{label}</span></NavLink>)}
      </nav>
      <section className="rail-block rail-docs" aria-label="문서 목록">
        <h2 className="rail-cap rail-label">문서</h2>
        {list.length === 0 ? <p className="rail-empty rail-label">{docs.state === 'loading' ? '불러오는 중…' : '문서가 아직 없어요'}</p>
          : <ul>{list.map(d => {
            const k = keyOf(d), name = d.kind === 'rfp' ? '제안요청서' : vendorName(d.vendor_id!), st = docStatus[d.job.status];
            const inner = <>
              {d.kind === 'rfp' ? <Icon d={ICONS.doc} /> : <VendorDot id={d.vendor_id!} />}
              <span className="rail-label rail-doc-name">{name}</span>
              <span className={`rail-label rail-doc-state st-${d.job.status}`}>{st}</span></>;
            return <li key={d.id}>{d.job.status === 'done'
              ? <Link to={`docs?doc=${k}`} className={`rail-doc${docParam === k ? ' current' : ''}`} aria-label={`${name} 보기`} title={`${name} · ${st}`}>{inner}</Link>
              : <span className="rail-doc off" title={`${name} · ${st}`} role="img" aria-label={`${name}, ${st}`}>{inner}</span>}</li>;
          })}</ul>}
      </section>
      {!onEvaluate && <section className="rail-block rail-progress rail-label" aria-label="입력 진행">
        <h2 className="rail-cap">내 입력</h2>
        <ul>{project.vendor_ids.map(v => <li key={v}>
          <VendorDot id={v} /><span className="rail-doc-name">{vendorName(v)}</span>
          <span className="rail-count">{sheet.data?.scores.filter(s => s.vendor_id === v).length ?? 0}/{perVendor}</span></li>)}</ul>
      </section>}
      <button type="button" className="rail-toggle" onClick={toggle} aria-expanded={!collapsed} aria-label={collapsed ? '왼쪽 칸 펼치기' : '왼쪽 칸 접기'}
        title={collapsed ? '펼치기' : '접기'}><Icon d={ICONS.fold} /><span className="rail-label">접기</span></button>
    </aside>
    <div className="eval-work">{children}</div>
  </div>;
}
