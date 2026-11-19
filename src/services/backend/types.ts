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
  existingMemberId?: string;
  boundDeviceId?: string;
}

export interface RemoteBackend {
  readonly kind: 'gas' | 'supabase';
  requestSnapshot(targetUrl?: string): Promise<RemoteSnapshot>;
  callAction(action: string, payload: unknown, targetUrl?: string): Promise<BackendActionResult>;
}
