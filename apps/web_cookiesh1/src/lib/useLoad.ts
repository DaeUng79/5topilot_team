import { useCallback, useEffect, useRef, useState } from 'react';

export type LoadState<T> =
  | { state: 'loading'; data?: T; error?: undefined }
  | { state: 'ok'; data: T; error?: undefined }
  | { state: 'error'; data?: T; error: unknown };

/** 화면 데이터 조회. 다시 불러오는 동안에도 이전 데이터를 유지합니다. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): LoadState<T> & { reload: () => Promise<void> } {
  const [s, setS] = useState<LoadState<T>>({ state: 'loading' });
  const seq = useRef(0);
  const run = useCallback(fn, deps);
  const reload = useCallback(async () => {
    const id = ++seq.current;
    setS(old => ({ state: 'loading', data: old.data }));
    try {
      const data = await run();
      if (id === seq.current) setS({ state: 'ok', data });
    } catch (error) {
      if (id === seq.current) setS(old => ({ state: 'error', data: old.data, error }));
    }
  }, [run]);
  useEffect(() => { void reload(); }, [reload]);
  return { ...s, reload };
}
