/**
 * Moonchoir Rollbook — Domain Models & Data Contracts
 * Compliant with Domain Invariants (Append-Only Event Sourcing & Configurable Taxonomy)
 */

// Permissive yet type-safe string unions (preserves autocompletion while allowing custom input)
export type PartType =
  | '소프라노'
  | '알토'
  | '테너'
  | '베이스'
  | '선생님'
  | '객원'
  | (string & {});

export type ScheduleCategory =
  | '정기연습'
  | '추가연습'
  | '연주'
  | '녹음'
  | '기타행사'
  | (string & {});

export type AttendanceStatus =
  | '출석'
  | '지각'
  | '결석'
  | '사유결석'
  | '수동인정'
  | (string & {});

export type MemberStatus =
  | '정단원'
  | '준단원'
  | '휴단원'
  | '퇴단원'
  | '선생님'
  | '객원'
  | (string & {});

export type RoleType = 'MEMBER' | 'ADMIN' | 'GUEST';

export type RSVPStatus = 'ATTEND' | 'ABSENT';

export type AuthMethod =
  | 'QR_WEB_CAM'
  | 'QR_NATIVE_CAM'
  | 'MANUAL_BY_ADMIN'
  | 'GUEST_QR'
  | 'MANUAL_PIN';

/**
 * 1. Member entity in the master roster
 */
export interface Member {
  id: string;
  name: string;
  part: PartType;
  phone?: string; // e.g. 010-1234-5678 (전체 연락처)
  phoneLast4: string; // 뒤 4자리 (본인 인증 및 PIN용)
  role: RoleType;
  createdAt: string; // ISO 8601
  status: 'ACTIVE' | 'INACTIVE';
  joinedAt?: string; // YYYY-MM-DD
  memberStatus?: MemberStatus; // 정단원, 준단원, 휴단원, 퇴단원, 선생님, 객원
  note?: string; // 비고 / 특이사항
}

/**
 * 2. Location Preset for Rehearsals & Concerts
 */
export interface LocationPreset {
  id: string;
  name: string;
  address?: string; // 도로명 기본 주소
  detailAddress?: string; // 상세 주소 (층/호수/연습실명)
  entranceNote?: string; // 입구 위치 및 진입 안내 (오시는 길)
  latitude: number;
  longitude: number;
  radiusMeters: number;
  isDefault?: boolean;
}

/**
 * 3. Recurrence Rule for Calendar Engine
 */
export interface RecurrenceRule {
  frequency: 'NONE' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
  interval?: number; // e.g., every 1 week, every 2 weeks
  byDays?: ('MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN')[];
  count?: number; // repeat N times
  untilDate?: string; // YYYY-MM-DD
}

/**
 * 4. Rehearsal or event schedule in calendar
 */
export interface Schedule {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  locationName: string;
  locationId?: string;
  detailAddress?: string;
  entranceNote?: string;
  targetLat?: number;
  targetLon?: number;
  radiusMeters?: number;
  category: ScheduleCategory;
  recurrenceRule?: string; // e.g. "WEEKLY_THU" or JSON serialized RecurrenceRule
  checkInPin?: string; // 4-digit temporary PIN for on-site check-in
  description?: string;
}

/**
 * 5. Pre-rehearsal RSVP vote record
 */
export interface RSVPVote {
  id: string;
  scheduleId: string;
  memberId: string;
  memberName: string;
  part: PartType;
  status: RSVPStatus;
  reason?: string;
  timestamp: string; // ISO 8601
}

/**
 * 6. Immutable raw check-in event log (Append-Only)
 */
export interface RawAttendanceLog {
  id: string;
  timestamp: string; // ISO 8601
  scheduleId: string;
  memberId: string;
  memberName: string;
  part: PartType;
  authMethod: AuthMethod;
  latitude?: number;
  longitude?: number;
  distanceMeters?: number;
  isVerifiedLocation: boolean;
  adminNote?: string;
}

/**
 * 7. Reconciled projection view for dashboard (Calculated from Raw Logs + RSVP)
 */
export interface AttendanceReconciliation {
  memberId: string;
  memberName: string;
  part: PartType;
  memberStatus?: MemberStatus;
  joinedAt?: string;
  note?: string;
  rsvpStatus: RSVPStatus | 'UNVOTED';
  rsvpReason?: string;
  checkInTime?: string;
  authMethod?: AuthMethod;
  distanceMeters?: number;
  isVerifiedLocation?: boolean;
  finalStatus: AttendanceStatus;
  isManualOverride: boolean;
  adminNote?: string;
}

/**
 * 8. Cumulative attendance summary projection for a period
 */
export interface CumulativeMemberAttendance {
  memberId: string;
  memberName: string;
  part: PartType;
  memberStatus: MemberStatus;
  joinedAt?: string;
  note?: string;
  totalSessions: number;
  attended: number;
  late: number;
  excused: number;
  absent: number;
  attendanceRate: number; // percentage (0 ~ 100)
  recentStatusList: AttendanceStatus[];
  badges: string[]; // e.g. '개근', '우수', '주의'
}

/**
 * 9. Global choir system settings & defaults
 */
export interface AppConfig {
  rehearsalDay: string; // e.g. "목요일"
  startTime: string; // "19:30"
  lateGraceMinutes: number; // 10
  defaultLat: number; // 37.5665
  defaultLon: number; // 126.9780
  defaultRadius: number; // 100m
  adminPin: string; // "1234"
  masterQrToken?: string; // Permanent Wall-mounted QR Token
  locationPresets?: LocationPreset[];
  customParts?: string[]; // Dynamic Parts Taxonomy
  customMemberStatuses?: string[]; // Dynamic Member Statuses
  customCategories?: string[]; // Dynamic Schedule Categories
  sheetsWebAppUrl?: string;
}

/**
 * 10. Device Token stored in LocalStorage for 1-time binding
 */
export interface BoundDeviceProfile {
  memberId: string;
  name: string;
  part: PartType;
  phoneLast4: string;
  boundAt: string; // ISO 8601
}
