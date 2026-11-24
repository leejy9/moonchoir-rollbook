// 홈 캡처용 기기 저장값(V3-22 지시서 §4 예시와 같은 데이터). 네트워크는 막고 이 값만 쓴다.
export const NOW_ISO = '2026-11-21T10:00:00+09:00';

const sch = (id, date, startTime, endTime, title, category, locationName) => ({
  id, date, startTime, endTime, title, category, locationName,
});

export function buildSeed({ role = 'MEMBER' } = {}) {
  const member = (id, name, part, r = 'MEMBER') => ({
    id, name, part, phoneLast4: '1234', role: r, status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00Z', joinedAt: '2026-01-01', memberStatus: '정단원',
  });
  const ev = (id, scheduleId, memberId, memberName, part, text, action = 'CREATE', targetId) => ({
    id, scheduleId, memberId, memberName, part, action, targetId, text,
    timestamp: '2026-11-20 10:00:00',
  });
  return {
    profile: { memberId: 'm1', name: '이하은', part: '알토', phoneLast4: '1234', boundAt: '2026-01-01T00:00:00Z' },
    members: [
      member('m1', '이하은', '알토', role),
      member('o1', '민지', '알토'),
      member('o2', '지은', '소프라노'),
      member('o3', '도윤', '테너'),
    ],
    schedules: [
      sch('A', '2026-11-21', '14:00', '17:00', '추가연습', '추가연습', '제2연습실'),
      sch('B', '2026-11-24', '19:30', '21:40', '정기연습', '정기연습', '제1연습실'),
      sch('C', '2026-11-28', '14:00', '17:00', '추가연습', '추가연습', '제2연습실'),
      sch('D', '2026-12-01', '19:30', '21:40', '정기연습', '정기연습', '제1연습실'),
      sch('E', '2026-12-05', '13:00', '18:00', '정기연주회 리허설', '연주', '아트홀'),
      sch('F', '2026-12-08', '19:30', '21:40', '정기연습', '정기연습', '제1연습실'),
    ],
    votes: [
      { id: 'v1', scheduleId: 'B', memberId: 'm1', memberName: '이하은', part: '알토', status: 'ATTEND', timestamp: '2026-11-20 09:00:00' },
      { id: 'v2', scheduleId: 'E', memberId: 'm1', memberName: '이하은', part: '알토', status: 'ATTEND', timestamp: '2026-11-20 09:00:00' },
    ],
    comments: [
      ev('c1', 'A', 'o1', '민지', '알토', '저 30분 늦어요, 악보 3번 챙겨 갈게요'),
      ev('c2', 'A', 'o2', '지은', '소프라노', '주차 가능한가요?'),
      ev('c3', 'A', 'm1', '이하은', '알토', '확인했어요'),
      ...['c4', 'c5', 'c6', 'c7', 'c8'].map((id) => ev(id, 'C', 'o3', '도윤', '테너', '댓글')),
      ev('d1', 'C', 'o3', '도윤', '테너', undefined, 'DELETE', 'c5'),
    ],
  };
}
