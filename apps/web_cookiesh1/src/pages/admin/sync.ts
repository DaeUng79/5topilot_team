import { useSyncExternalStore } from 'react';

/** 사이드바와 본문이 같은 데이터를 쓰도록, 문서·기준·위원이 바뀌면 알려 서로 다시 조회하게 합니다. */
let version = 0;
const subs = new Set<() => void>();
export function emitAdminChange() { version += 1; subs.forEach(f => f()); }
export function useAdminVersion() {
  return useSyncExternalStore(cb => { subs.add(cb); return () => { subs.delete(cb); }; }, () => version);
}
