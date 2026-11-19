import { calculateCumulativeAttendanceWithLifecycle } from '../src/utils/attendanceStats';
import type { Member, Schedule, RawAttendanceLog, RSVPVote, MemberStatusHistory } from '../src/types/rollbook';

const SHEETS_URL =
  'https://script.google.com/macros/s/AKfycbwWEhINO6ve9f7GSZhehhmWAcY8NkJ6vbNchWQoXkWpNnxFRsM110CoEgGuJ-41SKb4/exec?action=GET_INITIAL_DATA';

const SUPABASE_URL = 'https://hvsftdbqwxjbpfogoldw.supabase.co';
const SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2c2Z0ZGJxd3hqYnBmb2dvbGR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUwNDk2NjksImV4cCI6MjExMDYyNTY2OX0.Pg5U9ger1SD9mrjmKf404--AkKF5RRfU2E7va5EepjQ';

async function run() {
  console.log('1. Fetching live production snapshot from Google Sheets...');
  const sheetsStart = Date.now();
  const sheetsRes = await fetch(SHEETS_URL);
  if (!sheetsRes.ok) {
    throw new Error(`Failed to fetch from Google Sheets: HTTP ${sheetsRes.status}`);
  }
  const sheetsJson = (await sheetsRes.json()) as {
    success: boolean;
    data: {
      members: Member[];
      schedules: Schedule[];
      logs: RawAttendanceLog[];
      rsvpVotes: RSVPVote[];
      locations: unknown[];
      memberHistory: MemberStatusHistory[];
      programCards: unknown[];
      comments: unknown[];
      config: Record<string, unknown>;
    };
  };
  const sheetsDuration = Date.now() - sheetsStart;
  console.log(`✓ Fetched from Google Sheets in ${sheetsDuration}ms`);
  console.log(`  - Members: ${sheetsJson.data.members?.length || 0}`);
  console.log(`  - Schedules: ${sheetsJson.data.schedules?.length || 0}`);
  console.log(`  - Attendance Logs: ${sheetsJson.data.logs?.length || 0}`);
  console.log(`  - RSVP Votes: ${sheetsJson.data.rsvpVotes?.length || 0}`);

  function toArray(val: unknown): string[] {
    if (Array.isArray(val)) return val.map(String).map((s) => s.trim()).filter(Boolean);
    if (typeof val === 'string') {
      return val.split(',').map((s) => s.trim()).filter(Boolean);
    }
    return [];
  }

  function toNumeric(val: unknown): number | null {
    if (val === '' || val === null || val === undefined) return null;
    const num = Number(val);
    return isNaN(num) ? null : num;
  }

  // Normalize comma-separated string scalars and empty numeric strings
  if (Array.isArray(sheetsJson.data.schedules)) {
    for (const s of sheetsJson.data.schedules) {
      s.targetParts = toArray(s.targetParts);
      s.targetMemberIds = toArray(s.targetMemberIds);
      s.latitude = toNumeric((s as any).latitude);
      s.longitude = toNumeric((s as any).longitude);
      s.radiusMeters = toNumeric(s.radiusMeters) as any;
      s.seriesIndex = toNumeric(s.seriesIndex) as any;
      s.seriesTotal = toNumeric(s.seriesTotal) as any;
    }
  }

  if (Array.isArray(sheetsJson.data.programCards)) {
    for (const c of sheetsJson.data.programCards as any[]) {
      c.targetParts = toArray(c.targetParts);
      c.targetMemberIds = toArray(c.targetMemberIds);
    }
  }

  if (Array.isArray(sheetsJson.data.locations)) {
    for (const loc of sheetsJson.data.locations as any[]) {
      loc.latitude = toNumeric(loc.latitude) ?? 0.0;
      loc.longitude = toNumeric(loc.longitude) ?? 0.0;
      loc.radiusMeters = toNumeric(loc.radiusMeters) ?? 100;
    }
  }

  if (Array.isArray(sheetsJson.data.logs)) {
    for (const log of sheetsJson.data.logs as any[]) {
      log.distanceMeters = toNumeric(log.distanceMeters);
    }
  }

  console.log('\n2. Calling Supabase bulk migration RPC fn_import_sheets_snapshot...');
  const importStart = Date.now();
  const importRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/fn_import_sheets_snapshot`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_snapshot: sheetsJson }),
  });

  if (!importRes.ok) {
    const errText = await importRes.text();
    throw new Error(`Supabase migration RPC failed (HTTP ${importRes.status}): ${errText}`);
  }

  const importResult = await importRes.json();
  const importDuration = Date.now() - importStart;
  console.log(`✓ Imported into Supabase in ${importDuration}ms:`, importResult);

  console.log('\n3. Verifying snapshot from Supabase (fn_get_initial_snapshot)...');
  const supaStart = Date.now();
  const supaRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/fn_get_initial_snapshot`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  if (!supaRes.ok) {
    throw new Error(`Failed to fetch Supabase snapshot: HTTP ${supaRes.status}`);
  }

  const supaJson = (await supaRes.json()) as {
    success: boolean;
    data: {
      members: Member[];
      schedules: Schedule[];
      logs: RawAttendanceLog[];
      rsvpVotes: RSVPVote[];
      locations: unknown[];
      memberHistory: MemberStatusHistory[];
      programCards: unknown[];
      comments: unknown[];
      config: Record<string, unknown>;
    };
  };
  const supaDuration = Date.now() - supaStart;
  console.log(`✓ Fetched from Supabase in ${supaDuration}ms (Speedup: ${(sheetsDuration / supaDuration).toFixed(1)}x faster!)`);
  console.log(`  - Members: ${supaJson.data.members?.length || 0}`);
  console.log(`  - Schedules: ${supaJson.data.schedules?.length || 0}`);
  console.log(`  - Attendance Logs: ${supaJson.data.logs?.length || 0}`);
  console.log(`  - RSVP Votes: ${supaJson.data.rsvpVotes?.length || 0}`);

  console.log('\n4. Reconciling attendance calculations between Sheets and Supabase...');
  const sheetsStats = calculateCumulativeAttendanceWithLifecycle(
    sheetsJson.data.members,
    sheetsJson.data.schedules,
    sheetsJson.data.logs,
    sheetsJson.data.memberHistory || []
  );

  const supaStats = calculateCumulativeAttendanceWithLifecycle(
    supaJson.data.members,
    supaJson.data.schedules,
    supaJson.data.logs,
    supaJson.data.memberHistory || []
  );

  console.log(`  - Sheets evaluated members: ${sheetsStats.length}`);
  console.log(`  - Supabase evaluated members: ${supaStats.length}`);

  let mismatches = 0;
  for (const sMember of sheetsStats) {
    const sSupa = supaStats.find((m) => m.memberId === sMember.memberId);
    if (!sSupa) {
      console.error(`  [MISMATCH] Member missing in Supabase: ${sMember.memberName} (${sMember.memberId})`);
      mismatches++;
      continue;
    }

    if (
      sMember.attended !== sSupa.attended ||
      sMember.late !== sSupa.late ||
      sMember.excused !== sSupa.excused ||
      sMember.absent !== sSupa.absent ||
      sMember.attendanceRate !== sSupa.attendanceRate
    ) {
      console.error(`  [MISMATCH] Attendance diff for ${sMember.memberName}:`);
      console.error(`    Sheets:   출석 ${sMember.attended}, 지각 ${sMember.late}, 사유 ${sMember.excused}, 결석 ${sMember.absent}, 출석률 ${sMember.attendanceRate}%`);
      console.error(`    Supabase: 출석 ${sSupa.attended}, 지각 ${sSupa.late}, 사유 ${sSupa.excused}, 결석 ${sSupa.absent}, 출석률 ${sSupa.attendanceRate}%`);
      mismatches++;
    }
  }

  if (mismatches === 0) {
    console.log(`\n🎉 100% PERFECT MATCH! All ${sheetsStats.length} members have identical attendance stats!`);
  } else {
    console.error(`\n❌ Found ${mismatches} mismatches. Migration needs review.`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
