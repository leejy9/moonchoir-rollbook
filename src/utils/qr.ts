/**
 * QR Code payload utility for Moonchoir Rollbook
 */

export interface ParsedQRPayload {
  scheduleId?: string;
  masterToken?: string;
  timestamp?: number;
  type?: string;
}

/**
 * Creates the permanent wall-mounted Master QR text payload.
 */
export function generateMasterWallQRPayload(masterToken: string): string {
  return JSON.stringify({
    app: 'moonchoir',
    type: 'MASTER_WALL_QR',
    token: masterToken,
  });
}

/**
 * Creates the standard text payload encoded into a specific session's QR code.
 */
export function generateRehearsalQRPayload(scheduleId: string): string {
  return JSON.stringify({
    app: 'moonchoir',
    scheduleId,
    type: 'PAPER_QR',
  });
}

/**
 * Finds the most appropriate active or upcoming schedule for today when scanning a Master Wall QR.
 */
export function findActiveScheduleForMasterQR(
  schedules: import('../types/rollbook').Schedule[],
  referenceDate = new Date()
): import('../types/rollbook').Schedule | null {
  const y = referenceDate.getFullYear();
  const m = String(referenceDate.getMonth() + 1).padStart(2, '0');
  const d = String(referenceDate.getDate()).padStart(2, '0');
  const todayStr = `${y}-${m}-${d}`;

  // 1. Look for today's schedules
  const todaySchedules = schedules.filter((s) => s.date === todayStr);
  if (todaySchedules.length > 0) {
    return todaySchedules[0];
  }

  // 2. If no today schedule, find nearest upcoming schedule within 7 days
  const upcoming = schedules
    .filter((s) => s.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date));

  return upcoming[0] || schedules[0] || null;
}

/**
 * Verifies on-site temporary 4-digit PIN for a schedule
 */
export function verifySchedulePin(schedule: import('../types/rollbook').Schedule, inputPin: string): boolean {
  if (!schedule.checkInPin) {
    // If no specific pin set, default to last 4 digits of schedule id or allow '1234'
    return inputPin.trim() === '1234';
  }
  return schedule.checkInPin.trim() === inputPin.trim();
}

/**
 * Parses raw text from a scanned QR code (supports JSON or URL params or raw scheduleId)
 */
export function parseQRPayload(rawText: string): ParsedQRPayload {
  const trimmed = rawText.trim();

  // 1. Try parsing JSON format
  try {
    const data = JSON.parse(trimmed);
    if (data.token || data.type === 'MASTER_WALL_QR') {
      return {
        masterToken: data.token,
        type: 'MASTER_WALL_QR',
      };
    }
    if (data.scheduleId) {
      return {
        scheduleId: String(data.scheduleId),
        timestamp: data.timestamp,
        type: data.type,
      };
    }
  } catch {
    // Not a JSON string, continue to URL or raw
  }

  // 2. Try parsing URL query parameters
  try {
    const url = new URL(trimmed);
    const masterToken = url.searchParams.get('master');
    if (masterToken) {
      return { masterToken, type: 'MASTER_WALL_QR' };
    }
    const scheduleId = url.searchParams.get('scheduleId') || url.searchParams.get('checkin');
    if (scheduleId) {
      return { scheduleId };
    }
  } catch {
    // Not a valid URL, treat as raw text
  }

  // 3. Fallback: treat as raw schedule ID directly
  return {
    scheduleId: trimmed,
  };
}

/**
 * Zero-dependency Web Audio beep generator for instant scan feedback
 */
export function playScanSuccessSound(): void {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch {
    // Ignore audio context errors if browser blocks autoplay
  }
}
