import type { Candidate } from '../api/client';

export interface Row { line: number; name: string; organization: string; specialty: string; error: string | null }

export const TEMPLATE = '이름,소속,전문분야\n홍길동(예시),예시대학교,정보시스템\n';

/** 엑셀에서 "CSV UTF-8"로 저장한 파일을 읽습니다. 따옴표 안의 쉼표를 처리합니다. */
export function parseCsv(text: string, existing: Candidate[]): Row[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  const seen = new Set<string>();
  return lines.slice(1).map((line, i) => {
    const cells = (line.match(/("([^"]|"")*"|[^,]*)(,|$)/g) ?? []).map(c => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"').trim());
    const [name = '', organization = '', specialty = ''] = cells;
    const key = `${name}|${organization}`;
    const error = !name || !organization || !specialty ? '이름·소속·전문분야 중 빈 칸이 있어요'
      : seen.has(key) ? '파일 안에서 중복돼요'
        : existing.some(c => c.name === name && c.organization === organization) ? '이미 등록된 후보예요' : null;
    seen.add(key);
    return { line: i + 2, name, organization, specialty, error };
  });
}
