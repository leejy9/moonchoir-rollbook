import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { CheckInResult } from './CheckInResult';
import type { RawAttendanceLog } from '../../types/rollbook';

describe('CheckInResult Component (V3-23 §3 R5·R6)', () => {
  const dummyLog: RawAttendanceLog = {
    id: 'log_test',
    timestamp: '2026-11-21 13:58:07',
    scheduleId: 'sch_01',
    memberId: 'mem_01',
    memberName: '이하은',
    part: '알토',
    authMethod: 'QR_WEB_CAM',
    latitude: 37.5,
    longitude: 127.0,
    isVerifiedLocation: true,
  };

  it('SUCCESS 화면: 제목, 본문, 출석 상세 확인 (이모지 없음)', () => {
    const html = renderToString(
      <CheckInResult
        type="SUCCESS"
        savedLog={dummyLog}
        currentName="이하은"
        successInfo={{
          scheduleTitle: '정기 연습',
          locationName: '제1연습실',
        }}
        onClose={() => {}}
      />
    );

    expect(html).toContain('출석했어요');
    expect(html).toContain('이하은 단원님, 13:58에 출석 처리됐어요.');
    expect(html).toContain('정기 연습');
    expect(html).toContain('제1연습실');
    expect(html).toContain('13:58');
    expect(html).toContain('확인');
    // No emoji or musical note
    expect(html).not.toContain('🎵');
    expect(html).not.toContain('🎉');
  });

  it('GEO_FAILED 화면: 제목 및 본문 확인', () => {
    const html = renderToString(
      <CheckInResult
        type="FAILURE"
        kind="GEO_FAILED"
        detail="위치 권한이 꺼져 있습니다."
        onRetry={() => {}}
        onClose={() => {}}
      />
    );

    expect(html).toContain('위치를 확인하지 못했어요');
    expect(html).toContain('연습실 안에서 위치 사용을 허용했는지 확인하고 다시 시도해 주세요.');
    expect(html).toContain('위치 권한이 꺼져 있습니다.');
    expect(html).toContain('계속 안 되면 운영진에게 알려 주세요.');
    expect(html).toContain('다시 확인하기');
    expect(html).toContain('닫기');
  });

  it('OUT_OF_RANGE 화면: 제목, 거리, 반경 확인', () => {
    const html = renderToString(
      <CheckInResult
        type="FAILURE"
        kind="OUT_OF_RANGE"
        detail=""
        context={{
          locationName: '제1연습실',
          distanceMeters: 1530,
          radiusMeters: 150,
          accuracyMeters: 30,
        }}
        onRetry={() => {}}
        onClose={() => {}}
      />
    );

    expect(html).toContain('연습실 밖에서는 출석할 수 없어요');
    expect(html).toContain(
      '제1연습실에서 1.5km 떨어져 있어요 (측정 오차 약 ±30m). 연습실에 도착한 뒤 다시 시도해 주세요.'
    );
    expect(html).toContain('출석 인정 반경은 150m예요.');
    expect(html).toContain('다시 확인하기');
  });

  it('SAVE_FAILED 화면: 제목 및 상세 오류 문구 확인', () => {
    const html = renderToString(
      <CheckInResult
        type="FAILURE"
        kind="SAVE_FAILED"
        detail="서버에 연결할 수 없습니다."
        onRetry={() => {}}
        onClose={() => {}}
      />
    );

    expect(html).toContain('출석을 저장하지 못했어요');
    expect(html).toContain('서버에 연결할 수 없습니다.');
    expect(html).toContain('인터넷 연결을 확인하고 다시 시도해 주세요.');
    expect(html).toContain('다시 확인하기');
  });
});

describe('이모지·특수기호 전수 검사 (V3-23 §3 R8)', () => {
  it('QRScannerModal.tsx 및 checkin/ 아래 모든 파일에 이모지와 ✕, ↺가 없다', () => {
    const targetFiles = [
      resolve(process.cwd(), 'src/components/QRScannerModal.tsx'),
    ];

    const checkinDir = resolve(process.cwd(), 'src/components/checkin');
    for (const f of readdirSync(checkinDir)) {
      if ((f.endsWith('.tsx') || f.endsWith('.ts')) && !f.endsWith('.test.tsx') && !f.endsWith('.test.ts')) {
        targetFiles.push(resolve(checkinDir, f));
      }
    }

    const emojiRegex = /[\p{Extended_Pictographic}\u2715\u21BA]/u;

    for (const filePath of targetFiles) {
      const content = readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, lineIdx) => {
        // Skip comment lines in test files that mention the regex test itself
        if (filePath.endsWith('.test.tsx') && line.includes('emojiRegex')) return;
        const match = line.match(emojiRegex);
        expect(
          match,
          `Forbidden emoji/symbol '${match?.[0]}' found in ${filePath}:${lineIdx + 1}: ${line}`
        ).toBeNull();
      });
    }
  });
});
