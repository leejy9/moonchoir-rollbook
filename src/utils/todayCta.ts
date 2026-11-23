import type { AttendanceReconciliation, RSVPStatus, RSVPVote, Schedule } from '../types/rollbook';
import { getKSTClock } from './date';
import { getCheckInWindowState, isRsvpOpenForSchedule } from './timeWindow';

export interface TodayCtaInput {
  schedule: Schedule;
  now: Date;
  isRequired: boolean;
  myVote?: RSVPVote;
  myReconciled?: AttendanceReconciliation;
  isOnline: boolean;
}

export type TodayCtaState =
  | { kind: 'CANCELLED'; label: string; isButton: false }
  | { kind: 'ATTENDED'; time: string; label: string; isButton: false }
  | { kind: 'LATE'; time: string; label: string; isButton: false }
  | { kind: 'MANUAL_OK'; label: string; isButton: false }
  | { kind: 'MANUAL_ABSENT'; note?: string; label: string; isButton: false }
  | { kind: 'OFFLINE'; label: string; isButton: true; disabled: true }
  | { kind: 'CHECKIN_OPEN'; isRequired: boolean; label: string; isButton: true; disabled: false }
  | { kind: 'RSVP_NEW'; label: string; isButton: true; disabled: false }
  | { kind: 'RSVP_EDIT'; status: RSVPStatus; label: string; isButton: true; disabled: false }
  | { kind: 'EXCUSED'; label: string; isButton: false }
  | { kind: 'CLOSED_ABSENT'; label: string; isButton: false }
  | { kind: 'CLOSED_EXEMPT'; label: string; isButton: false };

/**
 * 오늘 집중 일정 또는 특정 일정의 단원 CTA 상태를 결정론적으로 판정하는 순수 함수.
 *
 * 판정 순서:
 * 1. 취소된 일정 (CANCELLED)
 * 2. 확정 출석/오버라이드 결과 (ATTENDED, LATE, MANUAL_OK, MANUAL_ABSENT)
 * 3. 출석 창 열림 (오프라인이면 OFFLINE, 온라인이면 CHECKIN_OPEN)
 * 4. 투표 가능 시간 (RSVP_NEW, RSVP_EDIT)
 * 5. 마감 후 (EXCUSED, CLOSED_ABSENT, CLOSED_EXEMPT)
 */
export function deriveTodayCta(input: TodayCtaInput): TodayCtaState {
  const { schedule, now, isRequired, myVote, myReconciled, isOnline } = input;

  // 1. 취소된 일정
  if (schedule.isCancelled) {
    return {
      kind: 'CANCELLED',
      label: '취소된 일정',
      isButton: false,
    };
  }

  // 2. 확정된 출석 및 운영진 판정 결과 (오직 myReconciled에 의해서만 결정됨)
  if (myReconciled && !myReconciled.isAttendanceCleared) {
    // 2-1. 운영진 결석 처리 (MANUAL_ABSENT)
    if (
      myReconciled.isManualOverride &&
      (myReconciled.finalStatus === '결석' ||
        myReconciled.finalStatus === '미참' ||
        myReconciled.adminNote?.includes('결석') ||
        myReconciled.adminNote?.includes('노쇼'))
    ) {
      const note = myReconciled.adminNote;
      const label = note ? `운영진 확인: 결석 (${note})` : '운영진 확인: 결석';
      return {
        kind: 'MANUAL_ABSENT',
        note,
        label,
        isButton: false,
      };
    }

    // 2-2. 운영진 수동 출석 인정 (MANUAL_OK)
    if (
      myReconciled.isManualOverride &&
      (myReconciled.finalStatus === '출석' ||
        myReconciled.finalStatus === '지각' ||
        myReconciled.finalStatus === '수동인정')
    ) {
      return {
        kind: 'MANUAL_OK',
        label: '운영진 인정',
        isButton: false,
      };
    }

    // 2-3. 단원 일반 출석 완료 (ATTENDED)
    if (myReconciled.finalStatus === '출석') {
      const clock = getKSTClock(myReconciled.checkInTime);
      const label = clock ? `출석 완료 ${clock}` : '출석 완료';
      return {
        kind: 'ATTENDED',
        time: clock,
        label,
        isButton: false,
      };
    }

    // 2-4. 단원 일반 지각 출석 (LATE)
    if (myReconciled.finalStatus === '지각') {
      const clock = getKSTClock(myReconciled.checkInTime);
      const label = clock ? `출석(지각) ${clock}` : '출석(지각)';
      return {
        kind: 'LATE',
        time: clock,
        label,
        isButton: false,
      };
    }
  }

  // 3. 출석 창 열림 여부 판정 (P1-01의 getCheckInWindowState 활용)
  const windowState = getCheckInWindowState(schedule, now);
  if (windowState.isOpen) {
    if (!isOnline) {
      return {
        kind: 'OFFLINE',
        label: '인터넷 연결 후 출석할 수 있어요',
        isButton: true,
        disabled: true,
      };
    }

    return {
      kind: 'CHECKIN_OPEN',
      isRequired,
      label: isRequired ? 'QR 찍기 / PIN 출석' : '자율 참여 출석',
      isButton: true,
      disabled: false,
    };
  }

  // 4. 사전 투표 가능 여부 판정 (P1-01의 isRsvpOpenForSchedule 활용)
  if (isRsvpOpenForSchedule(schedule, now)) {
    if (!myVote) {
      return {
        kind: 'RSVP_NEW',
        label: '참석 투표하기',
        isButton: true,
        disabled: false,
      };
    }

    return {
      kind: 'RSVP_EDIT',
      status: myVote.status,
      label: `투표 수정 · 현재 ${myVote.status === 'ATTEND' ? '참석' : '불참'}`,
      isButton: true,
      disabled: false,
    };
  }

  // 5. 마감 후 (출석 창 및 사전 투표 모두 마감)
  if (myReconciled?.finalStatus === '사유결석') {
    return {
      kind: 'EXCUSED',
      label: '사유 결석 처리됨',
      isButton: false,
    };
  }

  if (isRequired) {
    return {
      kind: 'CLOSED_ABSENT',
      label: '출석 마감 · 미출석',
      isButton: false,
    };
  }

  return {
    kind: 'CLOSED_EXEMPT',
    label: '필참 대상 아님',
    isButton: false,
  };
}
