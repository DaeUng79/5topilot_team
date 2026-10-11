// 시연 도구 상태(mock 전용). 로딩·오류·빈 상태를 발표·검증 때 재현합니다.
export interface DemoFlags { slow: boolean; serverError: boolean; saveFail: boolean; empty: boolean }

const KEY = 'simsa-demo-flags';
const initial: DemoFlags = { slow: false, serverError: false, saveFail: false, empty: false };

export function getFlags(): DemoFlags {
  try { return { ...initial, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return initial; }
}
export function setFlags(next: DemoFlags) { localStorage.setItem(KEY, JSON.stringify(next)); }
