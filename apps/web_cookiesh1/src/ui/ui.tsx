import { useEffect, useRef, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return <div className="page-header">
    <div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p className="muted">{description}</p>}</div>
    {actions && <div className="page-actions">{actions}</div>}
  </div>;
}

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>
    {(title || actions) && <div className="card-head">{title && <h2>{title}</h2>}{actions && <div className="card-actions">{actions}</div>}</div>}
    {children}
  </section>;
}

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

/** 상태는 색만으로 구분하지 않도록 기호를 함께 표시합니다. */
const toneMark: Record<Tone, string> = { neutral: '○', primary: '●', success: '✓', warning: '!', danger: '✕', info: 'i' };
export function Badge({ tone = 'neutral', children, mark = true }: { tone?: Tone; children: ReactNode; mark?: boolean }) {
  return <span className={`badge tone-${tone}`}>{mark && <span aria-hidden="true" className="badge-mark">{toneMark[tone]}</span>}{children}</span>;
}

export function StatCard({ label, value, sub, tone = 'neutral' }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  return <div className={`stat tone-${tone}`}><div className="stat-label">{label}</div><div className="stat-value">{value}</div>{sub && <div className="stat-sub">{sub}</div>}</div>;
}

export function Notice({ tone = 'info', title, children, role }: { tone?: Tone; title?: ReactNode; children?: ReactNode; role?: 'alert' | 'status' }) {
  return <div className={`notice tone-${tone}`} role={role}>
    <span className="notice-mark" aria-hidden="true">{toneMark[tone]}</span>
    <div>{title && <strong className="notice-title">{title}</strong>}{children && <div className="notice-body">{children}</div>}</div>
  </div>;
}

/** URL ?tab= 기반 탭 (새로고침해도 위치 유지) */
export function Tabs({ tabs, param = 'tab' }: { tabs: { key: string; label: ReactNode }[]; param?: string }) {
  const [params] = useSearchParams();
  const current = params.get(param) ?? tabs[0].key;
  return <nav className="tabs" aria-label="화면 탭">
    {tabs.map(t => <Link key={t.key} to={`?${param}=${t.key}`} replace aria-current={current === t.key ? 'page' : undefined}
      className={current === t.key ? 'active' : ''}>{t.label}</Link>)}
  </nav>;
}
export function useTab(defaultKey: string, param = 'tab') { return useSearchParams()[0].get(param) ?? defaultKey; }

/** 네이티브 dialog: 포커스 가두기·Esc 닫기를 브라우저가 처리하고, 닫힐 때 이전 포커스로 돌아갑니다. */
export function Dialog({ open, onClose, title, children, actions, variant = 'modal' }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; actions?: ReactNode; variant?: 'modal' | 'sheet';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) { returnTo.current = document.activeElement as HTMLElement | null; el.showModal(); }
    if (!open && el.open) { el.close(); returnTo.current?.focus(); }
  }, [open]);
  return <dialog ref={ref} className={`dialog dialog-${variant}`} onCancel={e => { e.preventDefault(); onClose(); }} aria-labelledby="dialog-title">
    {open && <>
      <h2 id="dialog-title">{title}</h2>
      <div className="dialog-body">{children}</div>
      {actions && <div className="dialog-actions">{actions}</div>}
    </>}
  </dialog>;
}

export function Steps({ steps, current }: { steps: { label: string; done: boolean }[]; current: number }) {
  return <ol className="steps" aria-label="진행 단계">
    {steps.map((s, i) => <li key={s.label} className={s.done ? 'done' : i === current ? 'current' : ''} aria-current={i === current ? 'step' : undefined}>
      <span className="step-dot" aria-hidden="true">{s.done ? '✓' : i + 1}</span>
      <span className="step-label">{s.label}<span className="sr-only">{s.done ? ' (완료)' : i === current ? ' (진행 중)' : ''}</span></span>
    </li>)}
  </ol>;
}

export function Progress({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return <div className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
    <div className="progress-bar" style={{ width: `${pct}%` }} />
  </div>;
}
