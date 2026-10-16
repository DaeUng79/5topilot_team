import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv';

describe('CSV 일괄 등록 미리보기', () => {
  it('빈 칸·파일 내 중복·기존 후보를 오류로 표시한다', () => {
    const rows = parseCsv('﻿이름,소속,전문분야\n가,"A대학교, 공대",보안\n나,B,\n가,"A대학교, 공대",보안\n기존,C,데이터\n',
      [{ id: 'x', name: '기존', organization: 'C', specialty: '데이터', active: true }]);
    expect(rows.map(r => r.error)).toEqual([null, '이름·소속·전문분야 중 빈 칸이 있어요', '파일 안에서 중복돼요', '이미 등록된 후보예요']);
    expect(rows[0].organization).toBe('A대학교, 공대');
  });
});
