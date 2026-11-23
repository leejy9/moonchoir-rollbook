import type {
  AppConfig,
  LocationPreset,
  Member,
  MemberStatusHistory,
  ProgramCard,
  RSVPVote,
  RawAttendanceLog,
  Schedule,
} from '../../types/rollbook';

export interface RemoteSnapshot {
  members?: Member[];
  schedules?: Schedule[];
  rsvpVotes?: RSVPVote[];
  logs?: RawAttendanceLog[];
  recentLogs?: RawAttendanceLog[];
  locations?: LocationPreset[];
  memberHistory?: MemberStatusHistory[];
  programCards?: ProgramCard[];
  comments?: unknown[];
  config?: Partial<AppConfig>;
}

export interface BackendActionResult {
  success: boolean;
  message?: string;
  error?: string;
  code?: string;
  existingMemberId?: string;
  boundDeviceId?: string;
  data?: unknown;
}

export interface RemoteBackend {
  readonly kind: 'gas' | 'supabase';
  requestSnapshot(targetUrl?: string): Promise<RemoteSnapshot>;
  callAction(action: string, payload: unknown, targetUrl?: string): Promise<BackendActionResult>;
}
