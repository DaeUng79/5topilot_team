import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ApiError, describeError } from '../api/client';
import type { LoadState } from '../lib/useLoad';
import { useSession } from '../lib/session';

export function Loading({ label = '불러오는 중', rows = 3 }: { label?: string; rows?: number }) {
  return <div className="state state-loading" role="status" aria-live="polite">
    <span className="sr-only">{label}…</span>
    {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" style={{ width: `${92 - i * 14}%` }} />)}
    <p className="muted">{label}…</p>
  </div>;
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="state state-empty">
    <div className="state-icon" aria-hidden="true">∅</div>
    <strong>{title}</strong>{children && <p className="muted">{children}</p>}{action}
  </div>;
}

export function Forbidden({ detail, action }: { detail?: string; action?: ReactNode }) {
  return <div className="state state-forbidden" role="alert">
    <div className="state-icon" aria-hidden="true">🔒</div>
    <strong>접근 권한이 없어요</strong>
    <p className="muted">{detail ?? '이 화면을 볼 수 있는 역할이 아닙니다.'}</p>{action}
  </div>;
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { logout } = useSession();
  const navigate = useNavigate();
  if (error instanceof ApiError && error.status === 403) return <Forbidden detail={error.message} />;
  const d = describeError(error);
  return <div className="state state-error" role="alert">
    <div className="state-icon" aria-hidden="true">!</div>
    <strong>{d.title}</strong><p className="muted">{d.detail}</p>
    <div className="row">
      {(d.action === 'retry' || d.action === 'reload') && onRetry && <button className="btn" onClick={onRetry}>다시 시도</button>}
      {d.action === 'login' && <button className="btn primary" onClick={() => { logout(); navigate('/login', { replace: true }); }}>다시 로그인</button>}
    </div>
  </div>;
}

/** 로딩·오류·빈 상태를 구분해 렌더합니다. 다시 불러오는 동안에는 이전 데이터를 그대로 보여 줍니다. */
export function Async<T>({ load, empty, children, loadingLabel }: {
  load: LoadState<T> & { reload: () => Promise<void> };
  empty?: (data: T) => ReactNode | false;
  children: (data: T) => ReactNode;
  loadingLabel?: string;
}) {
  if (load.data === undefined) {
    if (load.state === 'error') return <ErrorState error={load.error} onRetry={() => void load.reload()} />;
    return <Loading label={loadingLabel} />;
  }
  const emptyView = empty?.(load.data);
  return <>
    {load.state === 'error' && <ErrorState error={load.error} onRetry={() => void load.reload()} />}
    {emptyView || children(load.data)}
  </>;
}
