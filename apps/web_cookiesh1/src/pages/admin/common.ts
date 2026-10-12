import { api, request, unwrap, type Project } from '../../api/client';
import type { CriteriaRead, DocumentRead, ProgressRead, Stage } from '../../api/contract';
import type { Tone } from '../../ui/ui';

export const STEP_LABELS = ['사업 등록', '문서·기준', '위원 선정', '평가', '취합', '결과 확인'];

export const stageInfo: Record<Stage, { label: string; tone: Tone; current: number }> = {
  preparing: { label: '평가기준 준비', tone: 'warning', current: 1 },
  committee: { label: '위원 선정', tone: 'info', current: 2 },
  evaluating: { label: '평가 진행', tone: 'primary', current: 3 },
  collecting_done: { label: '위원장 확인 대기', tone: 'warning', current: 5 },
  confirmed: { label: '결과 확인 완료', tone: 'success', current: 6 },
};

export function stepsFor(stage: Stage) {
  const current = stageInfo[stage].current;
  return STEP_LABELS.map((label, i) => ({ label, done: i < current }));
}

export async function loadProjects() { return unwrap(await api.GET('/api/v1/projects')); }

export async function loadProject(projectId: string): Promise<Project> {
  const project = (await loadProjects()).find(p => p.id === projectId);
  if (!project) throw new Error('사업을 찾을 수 없습니다.');
  return project;
}

export interface ProjectSummary { project: Project; progress: ProgressRead; criteria: CriteriaRead }
export async function loadSummary(project: Project): Promise<ProjectSummary> {
  const [progress, criteria] = await Promise.all([
    request<ProgressRead>('GET', `/api/v1/projects/${project.id}/progress`),
    request<CriteriaRead>('GET', `/api/v1/projects/${project.id}/criteria`),
  ]);
  return { project, progress, criteria };
}

/** 사업의 문서 준비 현황(제안요청서·업체별 제안서). 사이드바·체크리스트·문서 등록 화면이 함께 씁니다. */
export function docStatus({ project }: ProjectSummary, docs: DocumentRead[] | undefined) {
  const done = (d: DocumentRead) => d.job.status === 'done';
  const rfpDone = !!docs?.some(d => d.kind === 'rfp' && done(d));
  const vendors = project.vendor_ids;
  const proposalsDone = vendors.filter(v => docs?.some(d => d.kind === 'proposal' && d.vendor_id === v && done(d)));
  const firstMissingVendor = vendors.find(v => !proposalsDone.includes(v));
  /** 아직 파일 자체가 없는 슬롯 수(처리 중·실패는 올린 것으로 봅니다). */
  const empty = docs ? (docs.some(d => d.kind === 'rfp') ? 0 : 1) + vendors.filter(v => !docs.some(d => d.kind === 'proposal' && d.vendor_id === v)).length : 0;
  return { rfpDone, vendors, proposalsDone, firstMissingVendor, empty };
}

export interface Workspace { summary: ProjectSummary; docs: DocumentRead[] }
export async function loadWorkspace(): Promise<Workspace[]> {
  return Promise.all((await loadProjects()).map(async project => {
    const [summary, docs] = await Promise.all([loadSummary(project), request<DocumentRead[]>('GET', `/api/v1/projects/${project.id}/documents`)]);
    return { summary, docs };
  }));
}

export function todoOf({ progress, criteria }: ProjectSummary): { text: string; tab: string } | null {
  const members = progress.members.filter(m => m.role !== 'reserve');
  switch (progress.stage) {
    case 'preparing': return criteria.status === 'draft'
      ? { text: 'AI가 만든 평가기준 초안을 검토하고 확정해 주세요.', tab: 'documents' }
      : { text: '제안요청서를 올려 평가기준 초안을 만드세요.', tab: 'documents' };
    case 'committee': return { text: '평가위원을 추첨하고 위원장을 지정해 주세요.', tab: 'committee' };
    case 'evaluating': {
      const left = members.filter(m => m.sheet_status !== 'submitted').length;
      return { text: `평가위원 ${left}명이 아직 제출하지 않았습니다.`, tab: 'progress' };
    }
    case 'collecting_done': return { text: '전원 제출 완료. 위원장의 결과 확인을 기다리고 있습니다.', tab: 'results' };
    default: return null;
  }
}
