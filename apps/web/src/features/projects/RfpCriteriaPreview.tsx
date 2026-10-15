import { useState } from 'react';
import type { CriterionDraft, ProjectSetup, RfpCriteria } from '../../api/client';
import { STATUS_LABEL, buildPreview, mergeCriteria, mergedTotal, type Preview, type PreviewRow } from './rfpCriteria';

// [제안요청서 반영] 미리보기. 곧바로 저장하지 않고 담당자가 포함 여부·이름·배점을 고친 뒤
// [검토 후 반영]을 눌렀을 때만 onApply(전체 목록)를 부른다. 공식 기준(원문 평가표)과 AI 제안(초안·보완)은
// 표를 나눠 보여 주고 AI 제안은 기본 선택하지 않는다.

const TEMPLATE_LABEL: Record<string, string> = {
  request_document: '원문 평가표', generated_from_summary: '요구사항 총괄표 기반 AI 초안',
};

export function RfpCriteriaPreview({ setup, parsed, busy, error, onApply, onClose }: {
  setup: ProjectSetup; parsed: RfpCriteria; busy: boolean; error: string;
  onApply: (criteria: CriterionDraft[]) => Promise<boolean>; onClose: () => void;
}) {
  const [preview, setPreview] = useState<Preview>(() => buildPreview(setup.criteria, parsed));
  const official = preview.rows.filter(r => r.kind === 'official');
  const suggested = preview.rows.filter(r => r.kind === 'ai');
  const includedCount = preview.rows.filter(r => r.include).length;
  const removeCount = preview.unmatched.filter(r => r.remove).length;
  const parsedTotal = parsed.items.reduce((sum, i) => sum + i.score, 0);
  const afterTotal = mergedTotal(setup.criteria, preview);
  const counts = {
    new: official.filter(r => r.status === 'new').length,
    changed: official.filter(r => r.status === 'changed').length,
    same: official.filter(r => r.status === 'same').length,
  };
  const valid = preview.rows.every(r => !r.include || (r.name.trim() && r.max_score >= 1 && r.max_score <= 100));

  function updateRow(key: string, patch: Partial<PreviewRow>) {
    setPreview(old => ({ ...old, rows: old.rows.map(r => r.key === key ? { ...r, ...patch } : r) }));
  }
  function toggleRemove(id: string, remove: boolean) {
    setPreview(old => ({ ...old, unmatched: old.unmatched.map(u => u.criterion.id === id ? { ...u, remove } : u) }));
  }
  async function apply() {
    if (await onApply(mergeCriteria(setup.criteria, preview))) onClose();
  }

  const rowTable = (rows: PreviewRow[], ai: boolean) => <div className="table-scroll"><table className="setup-table rfp-table">
    <thead><tr><th className="col-check">반영</th><th className="col-status">구분</th><th>평가부문</th><th>평가항목 · 평가기준 · 평가요소</th>
      <th className="col-score">현재 배점</th><th className="col-score">추출 배점</th><th>원문 출처</th></tr></thead>
    <tbody>{rows.map(row => <tr key={row.key} className={row.include ? '' : 'excluded'}>
      <td className="col-check"><input type="checkbox" checked={row.include} aria-label={`${row.name} 반영`} disabled={busy}
        onChange={e => updateRow(row.key, { include: e.target.checked })} /></td>
      <td className="col-status"><span className={`badge status-${row.status}`}>{STATUS_LABEL[row.status]}</span>
        {ai && <span className="badge origin-ai">AI 제안</span>}</td>
      <td className="muted">{row.division ?? '—'}</td>
      <td><input className="rfp-name" value={row.name} maxLength={100} aria-label={`${row.key} 평가항목명`} disabled={busy || !row.include}
          onChange={e => updateRow(row.key, { name: e.target.value })} />
        {row.description && <p className="rfp-desc">{row.description}</p>}
        {row.elements.length > 0 && <ul className="rfp-elements">{row.elements.map((el, i) => <li key={i}>{el}</li>)}</ul>}
        {row.source_quote && <p className="rfp-quote">원문: "{row.source_quote}"</p>}</td>
      <td className="col-score">{row.current ? `${row.current.max_score}점` : <span className="muted">없음</span>}</td>
      <td className="col-score"><input className="score" type="number" min={1} max={100} step={1} value={row.max_score || ''}
        aria-label={`${row.key} 배점`} disabled={busy || !row.include} onChange={e => updateRow(row.key, { max_score: Number(e.target.value) })} /></td>
      <td className="muted rfp-source">{row.source_label}</td>
    </tr>)}</tbody>
  </table></div>;

  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <div className="modal panel wide" role="dialog" aria-modal="true" aria-labelledby="rfp-preview-title" data-testid="rfp-preview">
      <div className="section-heading"><h2 id="rfp-preview-title">제안요청서 반영 미리보기</h2>
        <button type="button" className="modal-close" aria-label="닫기" onClick={onClose} disabled={busy}>×</button></div>
      <p className={parsed.is_sample || !parsed.official ? 'lock-note' : 'dev-note'} data-testid="rfp-notice">{parsed.notice}</p>
      {parsed.source && <p className="muted">출처: {parsed.source.filename ?? parsed.source.document_id} · 버전 {parsed.source.revision ?? '—'} ·
        {' '}{TEMPLATE_LABEL[parsed.source.template_source ?? ''] ?? parsed.source.template_source ?? '구분 없음'} · 생성 {parsed.source.created_at ?? '—'}.
        행별 원문 페이지는 파싱 결과에 아직 없어 문서명과 행 번호로 표시합니다.</p>}
      {error && <div className="error" role="alert">{error}</div>}

      <div className="rfp-summary" data-testid="rfp-summary">
        <span className="badge">현재 {setup.criteria.length}개 · {setup.total_score}점</span>
        <span className="badge">추출 {parsed.items.length}개 · {parsedTotal}점</span>
        <span className="badge status-new">신규 {counts.new}</span>
        <span className="badge status-changed">배점 변경 {counts.changed}</span>
        <span className="badge status-same">동일 {counts.same}</span>
        <span className="badge">제외 후보 {preview.unmatched.length}</span>
        <span className={`badge ${afterTotal === setup.required_total_score ? 'success' : 'warn'}`} data-testid="rfp-after-total">
          반영 후 합계 {afterTotal}점 / 총배점 {setup.required_total_score}점</span>
      </div>
      {afterTotal !== setup.required_total_score && <p className="lock-note" data-testid="rfp-total-warning">
        반영 후 배점 합계({afterTotal}점)가 기술평가 총배점({setup.required_total_score}점)과 다릅니다. 저장은 되지만 평가를 시작하려면 배점이나 총배점을 맞춰야 합니다.</p>}

      <h3>제안요청서 평가항목 {official.length}개</h3>
      {official.length ? rowTable(official, false) : <p className="muted">공식 평가표 항목이 없습니다.</p>}

      <h3>AI 보완 제안 {suggested.length}개 <span className="muted">(자동 반영하지 않음 · 필요한 항목만 선택)</span></h3>
      {suggested.length ? rowTable(suggested, true) : <p className="muted">AI 보완 제안이 없습니다.</p>}

      <h3>제안요청서에 없는 현재 항목 {preview.unmatched.length}개</h3>
      {preview.unmatched.length
        ? <div className="table-scroll"><table className="setup-table rfp-table">
          <thead><tr><th className="col-check">삭제</th><th>평가항목</th><th className="col-score">배점</th><th>출처</th></tr></thead>
          <tbody>{preview.unmatched.map(({ criterion, remove }) => <tr key={criterion.id} className={remove ? 'excluded' : ''}>
            <td className="col-check"><input type="checkbox" checked={remove} aria-label={`${criterion.name} 삭제`} disabled={busy}
              onChange={e => toggleRemove(criterion.id, e.target.checked)} /></td>
            <td>{criterion.name}</td><td className="col-score">{criterion.max_score}점</td>
            <td className="muted">{criterion.origin === 'rfp' ? '이전 제안요청서 반영' : criterion.origin === 'ai' ? 'AI 제안' : '직접 입력'}{criterion.source_label ? ` · ${criterion.source_label}` : ''}</td>
          </tr>)}</tbody>
        </table></div>
        : <p className="muted">현재 항목이 모두 제안요청서 항목과 짝이 맞습니다.</p>}

      <div className="modal-actions">
        <button type="button" onClick={onClose} disabled={busy}>취소</button>
        <button type="button" className="primary" disabled={busy || !valid || (includedCount === 0 && removeCount === 0)} onClick={() => void apply()}>
          검토 후 반영 ({includedCount}개 반영{removeCount ? `, ${removeCount}개 삭제` : ''})</button>
      </div>
    </div>
  </div>;
}
