import { beforeEach, describe, expect, it } from 'vitest';
import gasSource from '../../google-apps-script.js?raw';

/**
 * Apps Script(`google-apps-script.js`)의 댓글 처리(ADD/EDIT/DELETE_COMMENT)를
 * 가짜 SpreadsheetApp 위에서 실제로 실행해 검증한다. 실제 시트 확인을 대체하지는 않는다.
 */

type Cell = string | number;

class MockRange {
  private sheet: MockSheet;
  private row: number;
  private col: number;
  private rows: number;
  private cols: number;

  constructor(sheet: MockSheet, row: number, col: number, rows: number, cols: number) {
    this.sheet = sheet;
    this.row = row;
    this.col = col;
    this.rows = rows;
    this.cols = cols;
  }
  getValues(): Cell[][] {
    const out: Cell[][] = [];
    for (let r = 0; r < this.rows; r++) {
      const line: Cell[] = [];
      for (let c = 0; c < this.cols; c++) line.push(this.sheet.data[this.row - 1 + r]?.[this.col - 1 + c] ?? '');
      out.push(line);
    }
    return out;
  }
  setValues(values: Cell[][]) {
    values.forEach((line, r) => {
      const target = (this.sheet.data[this.row - 1 + r] ??= []);
      line.forEach((v, c) => {
        target[this.col - 1 + c] = v;
      });
    });
    return this;
  }
  setNumberFormat(format: string) {
    this.sheet.formats.push({ row: this.row, format });
    return this;
  }
  setBackground() {
    return this;
  }
  setFontColor() {
    return this;
  }
  setFontWeight() {
    return this;
  }
}

class MockSheet {
  data: Cell[][] = [];
  formats: Array<{ row: number; format: string }> = [];
  appendRow(row: Cell[]) {
    this.data.push([...row]);
  }
  getDataRange() {
    return { getValues: () => this.data.map((r) => [...r]) };
  }
  getLastRow() {
    return this.data.length;
  }
  getLastColumn() {
    return this.data[0]?.length ?? 0;
  }
  getRange(row: number, col: number, rows = 1, cols = 1) {
    return new MockRange(this, row, col, rows, cols);
  }
  setFrozenRows() {}
}

class MockSpreadsheet {
  sheets = new Map<string, MockSheet>();
  getSheetByName(name: string) {
    return this.sheets.get(name) ?? null;
  }
  insertSheet(name: string) {
    const sheet = new MockSheet();
    this.sheets.set(name, sheet);
    return sheet;
  }
}

interface GasApi {
  doPost: (e: { postData: { contents: string } }) => { text: string };
  doGet: (e: object) => { text: string };
}

function loadGas(spreadsheet: MockSpreadsheet): GasApi {
  const source = gasSource;
  const output = (text: string) => ({ text, setMimeType() { return this; } });
  const factory = new Function(
    'SpreadsheetApp',
    'LockService',
    'ContentService',
    'Utilities',
    `${source}\nreturn { doPost, doGet };`
  );
  return factory(
    { getActiveSpreadsheet: () => spreadsheet, getUi: () => ({}) },
    { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    { createTextOutput: (text: string) => output(text), MimeType: { JSON: 'JSON' } },
    { formatDate: () => '2026-10-23 19:30:00' }
  ) as GasApi;
}

describe('Apps Script 일정 댓글 처리', () => {
  let ss: MockSpreadsheet;
  let gas: GasApi;

  const post = (action: string, data: Record<string, unknown>) =>
    JSON.parse(gas.doPost({ postData: { contents: JSON.stringify({ action, data }) } }).text) as {
      success: boolean;
      message?: string;
      deduplicated?: boolean;
    };

  const comments = () => ss.getSheetByName('일정댓글')!.data;
  const base = { scheduleId: 's1', memberId: 'm1', memberName: '김하은', part: '소프라노', deviceId: 'dev_a' };

  beforeEach(() => {
    ss = new MockSpreadsheet();
    gas = loadGas(ss);
    // 첫 호출로 모든 탭이 만들어지게 한 뒤 단원명부에 시험용 단원을 넣는다
    gas.doGet({});
    const members = ss.getSheetByName('단원명부')!;
    members.data.push(['m1', '김하은', '소프라노']);
    members.data.push(['m2', '김하은(통합)', '소프라노']);
    const headers = members.data[0];
    const mergedCol = headers.indexOf('mergedIntoId');
    const idCol = headers.indexOf('id');
    const m1 = members.data.find((r) => r[idCol] === 'm1')!;
    m1[mergedCol] = 'm2'; // m1이 m2로 통합됨
  });

  it('첫 호출에서 일정댓글 탭과 헤더가 만들어진다', () => {
    expect(comments()[0]).toEqual([
      'id', 'scheduleId', 'memberId', 'memberName', 'part', 'action', 'targetId', 'text', 'timestamp', 'deviceId',
    ]);
  });

  it('댓글을 추가하면 CREATE 행이 서버 시각·기기와 함께 남는다', () => {
    const result = post('ADD_COMMENT', { ...base, id: 'c1', text: '늦을 것 같아요' });
    expect(result.success).toBe(true);
    const row = comments()[1];
    expect(row).toEqual(['c1', 's1', 'm1', '김하은', '소프라노', 'CREATE', '', '늦을 것 같아요', '2026-10-23 19:30:00', 'dev_a']);
  });

  it('같은 id로 다시 보내도 한 번만 저장하고 성공으로 응답한다', () => {
    post('ADD_COMMENT', { ...base, id: 'c1', text: '안녕하세요' });
    const again = post('ADD_COMMENT', { ...base, id: 'c1', text: '안녕하세요' });
    expect(again.success).toBe(true);
    expect(again.deduplicated).toBe(true);
    expect(comments()).toHaveLength(2);
  });

  it('빈 내용과 500자 초과는 저장하지 않는다', () => {
    expect(post('ADD_COMMENT', { ...base, id: 'c1', text: '   ' }).success).toBe(false);
    expect(post('ADD_COMMENT', { ...base, id: 'c2', text: 'a'.repeat(501) }).success).toBe(false);
    expect(post('ADD_COMMENT', { ...base, id: 'c3', text: 'a'.repeat(500) }).success).toBe(true);
    expect(comments()).toHaveLength(2);
  });

  it('= 로 시작하는 글이 수식이 되지 않도록 새 행을 일반 텍스트 서식으로 쓴다', () => {
    post('ADD_COMMENT', { ...base, id: 'c1', text: '=SUM(A1:A9)' });
    const sheet = ss.getSheetByName('일정댓글')!;
    expect(sheet.formats.some((f) => f.row === 2 && f.format === '@')).toBe(true);
    expect(sheet.data[1][7]).toBe('=SUM(A1:A9)');
  });

  it('작성자는 수정할 수 있고 EDIT 행이 추가되며 원본 행은 그대로 남는다', () => {
    post('ADD_COMMENT', { ...base, id: 'c1', text: '원문' });
    const result = post('EDIT_COMMENT', { ...base, id: 'e1', targetId: 'c1', text: '수정본' });
    expect(result.success).toBe(true);
    expect(comments()[1][7]).toBe('원문');
    expect(comments()[2].slice(0, 8)).toEqual(['e1', 's1', 'm1', '김하은', '소프라노', 'EDIT', 'c1', '수정본']);
  });

  it('다른 사람은 수정하거나 삭제할 수 없다', () => {
    post('ADD_COMMENT', { ...base, id: 'c1', text: '원문' });
    expect(post('EDIT_COMMENT', { ...base, memberId: 'm9', id: 'e1', targetId: 'c1', text: '변조' }).success).toBe(false);
    expect(post('DELETE_COMMENT', { ...base, memberId: 'm9', id: 'd1', targetId: 'c1' }).success).toBe(false);
    expect(comments()).toHaveLength(2);
  });

  it('통합된 단원(별칭)은 같은 사람으로 보고 수정을 허용한다', () => {
    post('ADD_COMMENT', { ...base, id: 'c1', text: '원문' }); // m1이 작성
    const result = post('EDIT_COMMENT', { ...base, memberId: 'm2', id: 'e1', targetId: 'c1', text: '대표 계정에서 수정' });
    expect(result.success).toBe(true);
  });

  it('삭제하면 DELETE 행이 누가·언제·어느 기기인지와 함께 남고, 이후 수정·재삭제는 거부한다', () => {
    post('ADD_COMMENT', { ...base, id: 'c1', text: '지울 댓글' });
    const del = post('DELETE_COMMENT', { ...base, id: 'd1', targetId: 'c1', deviceId: 'dev_b' });
    expect(del.success).toBe(true);
    expect(comments()[1][7]).toBe('지울 댓글');
    expect(comments()[2]).toEqual(['d1', 's1', 'm1', '김하은', '소프라노', 'DELETE', 'c1', '', '2026-10-23 19:30:00', 'dev_b']);
    expect(post('EDIT_COMMENT', { ...base, id: 'e2', targetId: 'c1', text: '다시' }).success).toBe(false);
    expect(post('DELETE_COMMENT', { ...base, id: 'd2', targetId: 'c1' }).success).toBe(false);
  });

  it('없는 원본 댓글은 수정·삭제할 수 없다', () => {
    expect(post('EDIT_COMMENT', { ...base, id: 'e1', targetId: 'nope', text: 'x' }).success).toBe(false);
  });

  it('doGet이 댓글 행을 comments로 돌려준다', () => {
    post('ADD_COMMENT', { ...base, id: 'c1', text: '안녕' });
    const body = JSON.parse(gas.doGet({}).text) as { data: { comments: Array<{ id: string; text: string }> } };
    expect(body.data.comments.map((c) => [c.id, c.text])).toEqual([['c1', '안녕']]);
  });
});
