import { createContext, useContext } from 'react';
import { ApiError, request } from '../../api/client';
import type { DocumentRead, ProjectClosed, ScheduleRead, VendorRead } from '../../api/contract';
import { useLoad } from '../../lib/useLoad';
import { fallbackVendors, loadProject, loadSummary, stepStates, type ProjectSummary } from './common';
import { isPending, usePendingPoll } from './steps/docParts';

/** 사업 한 건의 화면 데이터. 사이드바·개요·7단계 화면이 같은 값을 보고, 바뀌면 refresh() 한 번으로 모두 갱신됩니다. */
export interface ProjectData {
  summary: ProjectSummary;
  docs: DocumentRead[];
  /** 등록된 제안사(vendors API가 없으면 사업의 기존 vendor_ids로 대신 채움) */
  vendors: VendorRead[];
  /** false면 제안 API(vendors/schedule/close) 미연결 */
  linked: { vendors: boolean; schedule: boolean; close: boolean };
  schedule: ScheduleRead | null;
  closedInfo: ProjectClosed | null;
  /** 완료된 사업이면 모든 수정이 잠깁니다. */
  closed: boolean;
  steps: ReturnType<typeof stepStates>;
}
export interface ProjectCtx { pid?: string; data?: ProjectData; state: 'loading' | 'ok' | 'error'; error?: unknown; refresh: () => Promise<void> }

export const ProjectContext = createContext<ProjectCtx>({ state: 'loading', refresh: async () => {} });
export const useProject = () => useContext(ProjectContext);
/** 단계 화면 전용: 데이터가 준비된 뒤에만 렌더되므로 data가 항상 있습니다. */
export function useProjectData(): ProjectData & { refresh: () => Promise<void> } {
  const { data, refresh } = useProject();
  return { ...data!, refresh };
}

/** 제안 API가 아직 없으면(404) null로 두고 화면은 "미연결"로 표시합니다. */
async function optional<T>(p: Promise<T>): Promise<T | null> {
  try { return await p; } catch (e) { if (e instanceof ApiError && e.status === 404) return null; throw e; }
}

async function loadAll(pid: string): Promise<ProjectData & { pid: string }> {
  const summary = await loadSummary(await loadProject(pid));
  const [docs, vendors, schedule, closedInfo] = await Promise.all([
    request<DocumentRead[]>('GET', `/api/v1/projects/${pid}/documents`),
    optional(request<VendorRead[]>('GET', `/api/v1/projects/${pid}/vendors`)),
    optional(request<ScheduleRead>('GET', `/api/v1/projects/${pid}/schedule`)),
    optional(request<ProjectClosed>('GET', `/api/v1/projects/${pid}/close`)),
  ]);
  const list = vendors ?? fallbackVendors(summary.project);
  return {
    pid, summary, docs, vendors: list, schedule, closedInfo,
    linked: { vendors: vendors !== null, schedule: schedule !== null, close: closedInfo !== null },
    closed: summary.progress.stage === 'closed',
    steps: stepStates(summary, docs, list),
  };
}

/** AdminLayout이 한 번만 부르는 조회. 문서를 처리하는 동안에는 끝날 때까지 주기적으로 다시 조회합니다. */
export function useProjectLoader(pid: string | undefined): ProjectCtx {
  const load = useLoad(async () => (pid ? loadAll(pid) : null), [pid]);
  usePendingPoll(isPending(load.data?.docs), load.data, load.reload);
  const data = load.data && load.data.pid === pid ? load.data : undefined;
  return { pid, data, state: data ? 'ok' : load.state === 'error' ? 'error' : 'loading', error: load.error, refresh: load.reload };
}
