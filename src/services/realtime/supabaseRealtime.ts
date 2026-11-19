import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from '../backend/supabaseConfig';
import { sheetsService } from '../sheets';

export class SupabaseRealtimeService {
  private client: SupabaseClient | null = null;
  private channel: RealtimeChannel | null = null;
  private isStarted = false;

  public init(): void {
    if (this.isStarted) return;
    const config = getSupabaseConfig();
    if (!config) return;

    // Do not run in test environment unless explicitly enabled
    const isTest =
      typeof import.meta !== 'undefined' && import.meta.env
        ? import.meta.env.MODE === 'test'
        : false;
    if (isTest) return;

    try {
      this.client = createClient(config.url, config.anonKey, {
        realtime: {
          params: {
            eventsPerSecond: 10,
          },
        },
      });

      this.subscribe();
      this.setupLifecycleListeners();
      this.isStarted = true;
    } catch (err) {
      console.warn('[Realtime] Failed to initialize Supabase client:', err);
    }
  }

  private subscribe(): void {
    if (!this.client) return;

    if (this.channel) {
      try {
        void this.client.removeChannel(this.channel);
      } catch {
        // Ignore channel removal errors
      }
      this.channel = null;
    }

    this.channel = this.client
      .channel('moonchoir-realtime-channel')
      // 1. Raw Attendance Logs (QR / PIN / Manual Check-in)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'attendance_logs' },
        (payload) => {
          if (payload.new && typeof payload.new === 'object') {
            sheetsService.mergeRealtimeAttendanceLog(payload.new as Record<string, unknown>);
          }
        }
      )
      // 2. RSVP Votes (Pre-attendance intention: INSERT & UPDATE)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rsvp_votes' },
        (payload) => {
          if (payload.new && typeof payload.new === 'object') {
            sheetsService.mergeRealtimeRsvpVote(payload.new as Record<string, unknown>);
          }
        }
      )
      // 3. Schedule Comments (CREATE / EDIT / DELETE events)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'schedule_comment_events' },
        (payload) => {
          if (payload.new && typeof payload.new === 'object') {
            sheetsService.mergeRealtimeCommentEvent(payload.new as Record<string, unknown>);
          }
        }
      )
      .subscribe((_status, err) => {
        if (err) {
          console.warn('[Realtime] Subscription error:', err);
        }
      });
  }

  private setupLifecycleListeners(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    // Reconnect when mobile screen wakes up
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.isStarted) {
        if (!this.channel || this.channel.state === 'closed' || this.channel.state === 'errored') {
          this.subscribe();
        }
      }
    });

    // Reconnect when network returns online
    window.addEventListener('online', () => {
      if (this.isStarted) {
        this.subscribe();
      }
    });
  }

  public disconnect(): void {
    if (this.client && this.channel) {
      try {
        void this.client.removeChannel(this.channel);
      } catch {
        // Ignore removal error
      }
      this.channel = null;
    }
    this.isStarted = false;
  }
}

export const supabaseRealtime = new SupabaseRealtimeService();
