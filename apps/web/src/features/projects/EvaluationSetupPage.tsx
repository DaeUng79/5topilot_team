import { useEffect, useState, type ReactNode } from 'react';
import {
  api, unwrap, type CriterionDraft, type Project, type ProjectSetup, type RfpCriteria, type VendorDraft,
} from '../../api/client';
import { RfpCriteriaPreview } from './RfpCriteriaPreview';
import './evaluation-setup.css';

// 사업 상세 > 평가 설정. 관리자가 평가항목(이름·배점·순서)과 평가 대상 업체(이름·순서), 기술평가 총배점을
// 등록한다. 변경은 전체 목록을 PUT /projects/{id}/setup/* 로 보내 바로 저장되며, 평가표(ScoreEditor)는 이 설정
// (항목 수 × 업체 수)으로 자동 구성된다. [제안요청서 반영]은 파싱 결과를 미리보기(RfpCriteriaPreview)로 보여 주고
// 담당자가 [검토 후 반영]을 눌렀을 때만 저장한다. 평가가 시작되면 서버가 잠그고(409) 화면은 사유를 보여 준다.
// 시작용 샘플 사업(demo-project)도 같은 화면을 쓰며 이 화면이 샘플 자료를 바꾸지는 않는다.

type Modal = { kind: 'criterion' | 'vendor'; index: number | null } | null; // index null = 추가
type SetupResult = { data?: ProjectSetup; error?: unknown; response: Response };
const ORIGIN_LABEL = { rfp: '제안요청서', ai: 'AI 제안', manual: '직접 입력' } as const;

function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function EvaluationSetupPage({ project, onChanged }: { project: Project; onChanged: () => Promise<void> }) {
  const [setup, setSetup] = useState<ProjectSetup | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [rfp, setRfp] = useState<RfpCriteria | null>(null); // 미리보기 중인 파싱 결과
  const [rfpNotice, setRfpNotice] = useState<RfpCriteria | null>(null); // 연결 안 됨·결과 없음 안내
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const params = { path: { project_id: project.id } };

  async function load() {
    setError('');
    try { setSetup(unwrap(await api.GET('/api/v1/projects/{project_id}/setup', { params }))); }
    catch (e) { setError(String(e)); }
  }
  useEffect(() => { void load(); }, [project.id]);

  // 저장에 성공하면 사업 목록(App)도 다시 읽어 평가 화면이 새 설정을 쓰게 한다.
  async function save(request: () => Promise<SetupResult>, message: string): Promise<boolean> {
    setBusy(true); setError(''); setNotice('');
    try {
      setSetup(unwrap(await request())); setNotice(message); await onChanged(); return true;
    } catch (e) { setError(String(e)); return false; } finally { setBusy(false); }
  }
  const saveCriteria = (criteria: CriterionDraft[], message = '평가항목을 저장했습니다.') => save(
    () => api.PUT('/api/v1/projects/{project_id}/setup/criteria', { params, body: { criteria } }), message);
  const saveVendors = (vendors: VendorDraft[]) => save(
    () => api.PUT('/api/v1/projects/{project_id}/setup/vendors', { params, body: { vendors } }), '업체 목록을 저장했습니다.');
  const saveTotal = (technical_total_score: number) => save(
    () => api.PUT('/api/v1/projects/{project_id}/setup/total-score', { params, body: { technical_total_score } }), '기술평가 총배점을 저장했습니다.');

  // 제안요청서 파싱 결과(저장본)를 읽어 미리보기를 연다. 연결이 없으면 안내와 함께 테스트용 예시 자료 버튼을 보인다.
  async function loadRfp(sample = false) {
    setBusy(true); setError(''); setNotice(''); setRfpNotice(null);
    try {
      const result = unwrap(await api.GET('/api/v1/projects/{project_id}/rfp-criteria', { params: { ...params, query: { sample } } }));
      if (result.status === 'ready' || result.status === 'sample') setRfp(result); else setRfpNotice(result);
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }

  function closeModal() { setModal(null); setError(''); }
  async function submitCriterion(form: HTMLFormElement) {
    if (!setup || !modal) return;
    const data = new FormData(form);
    const draft = { name: String(data.get('name')).trim(), max_score: Number(data.get('max_score')) };
    const next: CriterionDraft[] = modal.index === null
      ? [...setup.criteria, { ...draft, origin: 'manual' }]
      : setup.criteria.map((c, i) => i === modal.index ? { ...c, ...draft } : c);
    if (await saveCriteria(next)) closeModal();
  }
  async function submitVendor(form: HTMLFormElement) {
    if (!setup || !modal) return;
    const draft = { name: String(new FormData(form).get('name')).trim() };
    const next: VendorDraft[] = modal.index === null
      ? [...setup.vendors, draft]
      : setup.vendors.map((v, i) => i === modal.index ? { ...v, ...draft } : v);
    if (await saveVendors(next)) closeModal();
  }
  async function removeCriterion(index: number) {
    if (!setup || !window.confirm(`'${setup.criteria[index].name}' 평가항목을 삭제할까요?`)) return;
    await saveCriteria(setup.criteria.filter((_, i) => i !== index));
  }
  async function removeVendor(index: number) {
    if (!setup || !window.confirm(`'${setup.vendors[index].name}' 업체를 삭제할까요?`)) return;
    await saveVendors(setup.vendors.filter((_, i) => i !== index));
  }

  if (!setup) {
    return <section className="panel">{error ? <div className="error" role="alert">{error}</div> : '평가 설정을 불러오는 중입니다.'}</section>;
  }
  const editingCriterion = modal?.kind === 'criterion' && modal.index !== null ? setup.criteria[modal.index] : null;
  const editingVendor = modal?.kind === 'vendor' && modal.index !== null ? setup.vendors[modal.index] : null;
  const allEditable = setup.criteria_editable && setup.vendors_editable;
  const canEditCriteria = setup.criteria_editable && !busy;
  const canEditVendors = setup.vendors_editable && !busy;
  const totalMismatch = setup.total_score !== setup.required_total_score;

  return <>
    <div className="setup-status">
      <strong className="setup-project-name">{setup.name}</strong>
      <span className="badge">{setup.criteria_version ? `평가기준 v${setup.criteria_version} 확정` : '평가기준 편집 중 (v0)'}</span>
      <span className={`badge ${allEditable ? 'success' : ''}`}>{allEditable ? '편집 가능' : '변경 제한'}</span>
      <form className="total-form" onSubmit={e => { e.preventDefault(); void saveTotal(Number(new FormData(e.currentTarget).get('total'))); }}>
        <label>총배점 변경<input name="total" type="number" min={1} max={1000} step={1} required key={setup.required_total_score}
          defaultValue={setup.required_total_score} disabled={!canEditCriteria} /></label>
        <button type="submit" disabled={!canEditCriteria}>총배점 저장</button>
      </form>
      <span className="muted">평가항목 {setup.criteria.length}개 · 업체 {setup.vendors.length}개 · 배점 합계 {setup.total_score}점 / 총배점 {setup.required_total_score}점 · 변경은 바로 저장되며 평가표는 이 설정으로 자동 구성됩니다.</span>
    </div>
    {error && !modal && !rfp && <div className="error" role="alert">{error}</div>}
    {notice && <p role="status" className="success-text">{notice}</p>}

    <section className="panel" data-testid="criteria-panel">
      <div className="section-heading"><h2>평가항목 <span className="count">{setup.criteria.length}</span></h2>
        <div className="actions-inline">
          <button type="button" data-testid="rfp-import" disabled={!canEditCriteria} onClick={() => void loadRfp()}>제안요청서 반영</button>
          <button type="button" className="primary" disabled={!canEditCriteria} onClick={() => setModal({ kind: 'criterion', index: null })}>+ 평가항목 추가</button>
        </div></div>
      {setup.criteria_lock_reason && <p className="lock-note">{setup.criteria_lock_reason}</p>}
      {totalMismatch && <p className="lock-note" data-testid="total-warning">
        배점 합계가 {setup.total_score}점입니다. 평가를 시작하거나 기준을 확정하려면 기술평가 총배점 {setup.required_total_score}점과 같아야 합니다.</p>}
      {rfpNotice && <p className="lock-note" data-testid="rfp-unavailable">{rfpNotice.notice}
        {' '}<button type="button" className="link" disabled={busy} onClick={() => void loadRfp(true)}>테스트용 예시 자료로 미리보기</button></p>}
      <div className="table-scroll"><table className="setup-table" data-testid="criteria-table">
        <thead><tr><th className="col-order">순서</th><th>평가항목</th><th className="col-score">배점</th><th className="col-manage">관리</th></tr></thead>
        <tbody>{setup.criteria.map((c, i) => <tr key={c.id}>
          <td className="col-order"><span className="order-no">{i + 1}</span>
            <span className="order-buttons">
              <button type="button" className="icon" aria-label={`${c.name} 위로`} title="위로" disabled={!canEditCriteria || i === 0}
                onClick={() => void saveCriteria(move(setup.criteria, i, i - 1))}>▲</button>
              <button type="button" className="icon" aria-label={`${c.name} 아래로`} title="아래로" disabled={!canEditCriteria || i === setup.criteria.length - 1}
                onClick={() => void saveCriteria(move(setup.criteria, i, i + 1))}>▼</button>
            </span></td>
          <td><div className="crit-name">{c.name}
              {c.origin && c.origin !== 'manual' && <span className={`badge origin-${c.origin}`}>{ORIGIN_LABEL[c.origin]}</span>}</div>
            {(c.division || c.source_label) && <div className="muted crit-meta">{[c.division, c.source_label].filter(Boolean).join(' · ')}</div>}</td>
          <td className="col-score">{c.max_score}점</td>
          <td className="col-manage">
            <button type="button" aria-label={`${c.name} 수정`} disabled={!canEditCriteria} onClick={() => setModal({ kind: 'criterion', index: i })}>수정</button>
            <button type="button" className="danger" aria-label={`${c.name} 삭제`} disabled={!canEditCriteria} onClick={() => void removeCriterion(i)}>삭제</button>
          </td>
        </tr>)}
        {!setup.criteria.length && <tr><td colSpan={4} className="muted">평가항목이 없습니다. '+ 평가항목 추가'로 직접 입력하거나 '제안요청서 반영'으로 파싱 결과를 가져오세요.</td></tr>}</tbody>
        <tfoot><tr><td colSpan={2}>전체 배점 합계</td><td className="col-score"><strong data-testid="total-score">{setup.total_score}점</strong></td><td /></tr></tfoot>
      </table></div>
    </section>

    <section className="panel" data-testid="vendor-panel">
      <div className="section-heading"><h2>평가 대상 업체 <span className="count">{setup.vendors.length}</span></h2>
        <button type="button" className="primary" disabled={!canEditVendors} onClick={() => setModal({ kind: 'vendor', index: null })}>+ 업체 추가</button></div>
      {setup.vendors_lock_reason && <p className="lock-note">{setup.vendors_lock_reason}</p>}
      <div className="table-scroll"><table className="setup-table" data-testid="vendor-table">
        <thead><tr><th className="col-order">순서</th><th>업체명</th><th className="col-manage">관리</th></tr></thead>
        <tbody>{setup.vendors.map((v, i) => <tr key={v.id}>
          <td className="col-order"><span className="order-no">{i + 1}</span>
            <span className="order-buttons">
              <button type="button" className="icon" aria-label={`${v.name} 위로`} title="위로" disabled={!canEditVendors || i === 0}
                onClick={() => void saveVendors(move(setup.vendors, i, i - 1))}>▲</button>
              <button type="button" className="icon" aria-label={`${v.name} 아래로`} title="아래로" disabled={!canEditVendors || i === setup.vendors.length - 1}
                onClick={() => void saveVendors(move(setup.vendors, i, i + 1))}>▼</button>
            </span></td>
          <td>{v.name}</td>
          <td className="col-manage">
            <button type="button" aria-label={`${v.name} 수정`} disabled={!canEditVendors} onClick={() => setModal({ kind: 'vendor', index: i })}>수정</button>
            <button type="button" className="danger" aria-label={`${v.name} 삭제`} disabled={!canEditVendors || setup.vendors.length <= 1}
              title={setup.vendors.length <= 1 ? '업체는 최소 1개 필요합니다.' : undefined} onClick={() => void removeVendor(i)}>삭제</button>
          </td>
        </tr>)}</tbody>
      </table></div>
      <p className="muted">업체 순서는 평가표의 열 순서입니다. 평가표에 입력이 시작되면 순서·이름을 바꿀 수 없습니다.</p>
    </section>

    {modal && <Modal title={modal.kind === 'criterion' ? (modal.index === null ? '평가항목 추가' : '평가항목 수정') : (modal.index === null ? '업체 추가' : '업체 수정')} onClose={closeModal}>
      {error && <div className="error" role="alert">{error}</div>}
      {modal.kind === 'criterion'
        ? <form className="modal-form" onSubmit={e => { e.preventDefault(); void submitCriterion(e.currentTarget); }}>
          <label>평가항목명<input name="name" required maxLength={100} autoFocus defaultValue={editingCriterion?.name ?? ''} placeholder="예: 사업 이해도" /></label>
          <label>배점<input name="max_score" type="number" required min={1} max={100} step={1} defaultValue={editingCriterion?.max_score ?? ''} placeholder="예: 10" /></label>
          <p className="muted">현재 배점 합계 {setup.total_score}점{editingCriterion ? ` (이 항목 ${editingCriterion.max_score}점 포함)` : ''}. 합계가 총배점 {setup.required_total_score}점이 되도록 1~100점 정수로 입력합니다.</p>
          <div className="modal-actions"><button type="button" onClick={closeModal}>취소</button><button className="primary" disabled={busy}>저장</button></div>
        </form>
        : <form className="modal-form" onSubmit={e => { e.preventDefault(); void submitVendor(e.currentTarget); }}>
          <label>업체명<input name="name" required maxLength={200} autoFocus defaultValue={editingVendor?.name ?? ''} placeholder="예: (주)한빛소프트" /></label>
          <p className="muted">같은 이름의 업체는 등록할 수 없습니다.</p>
          <div className="modal-actions"><button type="button" onClick={closeModal}>취소</button><button className="primary" disabled={busy}>저장</button></div>
        </form>}
    </Modal>}
    {rfp && <RfpCriteriaPreview setup={setup} parsed={rfp} busy={busy} error={error}
      onApply={criteria => saveCriteria(criteria, '제안요청서 평가항목을 반영했습니다.')} onClose={() => { setRfp(null); setError(''); }} />}
  </>;
}

// 기존 패널 스타일을 그대로 쓰는 모달. 바깥 클릭·Esc·× 로 닫는다.
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal panel" role="dialog" aria-modal="true" aria-labelledby="setup-modal-title">
      <div className="section-heading"><h2 id="setup-modal-title">{title}</h2>
        <button type="button" className="modal-close" aria-label="닫기" onClick={onClose}>×</button></div>
      {children}
    </div>
  </div>;
}
