import { useState, type FormEvent } from 'react';
import { api, describeError, unwrap, type Candidate } from '../../api/client';
import { useLoad } from '../../lib/useLoad';
import { Async, Empty } from '../../ui/states';
import { Card, Dialog, Notice, PageHeader } from '../../ui/ui';
import { parseCsv, TEMPLATE, type Row } from '../../lib/csv';

export function EvaluatorsPage() {
  const load = useLoad(async () => unwrap(await api.GET('/api/v1/committee/candidates')), []);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [bulk, setBulk] = useState(false);
  return <>
    <PageHeader eyebrow="평가위원 관리" title="평가위원 후보" description="후보를 등록하면 사업별 추첨 모집단에 넣을 수 있습니다."
      actions={<><button className="btn" onClick={() => setBulk(true)}>CSV 일괄 등록</button>
        <button className="btn primary" onClick={() => setAdding(true)}>＋ 개별 등록</button></>} />
    <Card>
      <div className="filters"><label className="field inline"><span className="sr-only">검색</span>
        <input type="search" placeholder="이름·소속·분야 검색" value={query} onChange={e => setQuery(e.target.value)} /></label></div>
      <Async load={load} loadingLabel="후보 목록을 불러오는 중"
        empty={list => !list.length && <Empty title="등록된 후보가 없어요" action={<button className="btn primary" onClick={() => setAdding(true)}>후보 등록</button>} />}>
        {list => {
          const rows = list.filter(c => `${c.name} ${c.organization} ${c.specialty}`.includes(query.trim()));
          return <>
            <p className="muted">{rows.length}명</p>
            {rows.length ? <div className="table-wrap"><table className="table">
              <thead><tr><th>이름</th><th>소속</th><th>전문분야</th><th>상태</th></tr></thead>
              <tbody>{rows.map(c => <tr key={c.id}><td><strong>{c.name}</strong></td><td>{c.organization}</td><td>{c.specialty}</td>
                <td>{c.active ? '활성' : '비활성'}</td></tr>)}</tbody>
            </table></div> : <Empty title="검색 결과가 없어요" />}
          </>;
        }}
      </Async>
    </Card>
    <AddDialog open={adding} onClose={() => setAdding(false)} onAdded={() => void load.reload()} />
    {load.data && <BulkDialog open={bulk} existing={load.data} onClose={() => setBulk(false)} onDone={() => void load.reload()} />}
  </>;
}

function AddDialog({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget, data = new FormData(form);
    setBusy(true); setError(null);
    try {
      unwrap(await api.POST('/api/v1/committee/candidates', { body: {
        name: String(data.get('name')).trim(), organization: String(data.get('organization')).trim(), specialty: String(data.get('specialty')).trim() } }));
      form.reset(); onAdded(); onClose();
    } catch (err) { setError(err); } finally { setBusy(false); }
  }
  return <Dialog open={open} onClose={onClose} title="평가위원 후보 등록">
    <form className="form" onSubmit={submit}>
      <label className="field">이름<input name="name" required maxLength={100} autoFocus /></label>
      <label className="field">소속<input name="organization" required maxLength={200} /></label>
      <label className="field">전문분야<input name="specialty" required maxLength={100} placeholder="예: 정보시스템, 보안" /></label>
      <p className="muted small">연락처는 현재 API 계약에 없어 받지 않습니다(본인확인용 번호는 담당자 합의 후 추가).</p>
      {error !== null && <Notice tone="danger" role="alert" title={describeError(error).title}>{describeError(error).detail}</Notice>}
      <div className="dialog-actions"><button type="button" className="btn" onClick={onClose}>취소</button>
        <button className="btn primary" disabled={busy}>{busy ? '등록 중…' : '등록'}</button></div>
    </form>
  </Dialog>;
}

function BulkDialog({ open, existing, onClose, onDone }: { open: boolean; existing: Candidate[]; onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [result, setResult] = useState<{ ok: number; failed: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = rows?.filter(r => !r.error) ?? [];
  function close() { setRows(null); setResult(null); onClose(); }
  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob(['﻿' + TEMPLATE], { type: 'text/csv;charset=utf-8' }));
    Object.assign(document.createElement('a'), { href: url, download: '평가위원_등록양식.csv' }).click();
    URL.revokeObjectURL(url);
  }
  async function register() {
    setBusy(true);
    const failed: string[] = [];
    for (const r of valid) {
      try { unwrap(await api.POST('/api/v1/committee/candidates', { body: { name: r.name, organization: r.organization, specialty: r.specialty } })); }
      catch (e) { failed.push(`${r.line}행 ${r.name}: ${describeError(e).detail}`); }
    }
    setResult({ ok: valid.length - failed.length, failed }); setBusy(false); onDone();
  }
  return <Dialog open={open} onClose={close} title="CSV로 일괄 등록" actions={result
    ? <button className="btn primary" onClick={close}>닫기</button>
    : <><button className="btn" onClick={close}>취소</button>
      <button className="btn primary" disabled={!valid.length || busy} onClick={() => void register()}>{busy ? '등록 중…' : `${valid.length}명 등록`}</button></>}>
    {result ? <Notice tone={result.failed.length ? 'warning' : 'success'} role="status" title={`${result.ok}명을 등록했습니다.`}>
      {result.failed.length > 0 && <ul>{result.failed.map(f => <li key={f}>{f}</li>)}</ul>}</Notice> : <>
      <p className="muted">양식을 내려받아 엑셀에서 작성한 뒤 <strong>CSV UTF-8</strong>로 저장해 올려 주세요. (.xlsx 직접 읽기는 후속 작업)</p>
      <div className="row"><button className="btn sm" onClick={downloadTemplate}>양식 내려받기 (.csv)</button>
        <label className="btn sm">파일 선택<input type="file" accept=".csv,text/csv" hidden onChange={async e => {
          const f = e.target.files?.[0]; if (f) setRows(parseCsv(await f.text(), existing)); e.target.value = '';
        }} /></label></div>
      {rows && <>
        <p aria-live="polite">미리보기: {rows.length}행 · 등록 가능 <strong>{valid.length}</strong> · 오류 <strong className={valid.length < rows.length ? 'text-danger' : ''}>{rows.length - valid.length}</strong></p>
        <div className="table-wrap small-table"><table className="table">
          <thead><tr><th>행</th><th>이름</th><th>소속</th><th>분야</th><th>확인</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.line} className={r.error ? 'row-warn' : ''}><td>{r.line}</td><td>{r.name}</td><td>{r.organization}</td><td>{r.specialty}</td>
            <td>{r.error ? <span className="text-danger">✕ {r.error}</span> : '✓'}</td></tr>)}</tbody>
        </table></div>
      </>}
    </>}
  </Dialog>;
}
