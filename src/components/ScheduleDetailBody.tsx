import React, { useEffect, useState } from 'react';
import type { Member, Schedule } from '../types/rollbook';
import { isMemberRequiredForSchedule, resolveMergedMemberIds } from '../utils/attendanceStats';
import { buildKakaoMapLink, findScheduleAddress } from '../utils/kakaoMaps';
import { buildRsvpTally } from '../utils/rsvpTally';
import { sheetsService } from '../services/sheets';
import { IconClock, IconLocation } from './Icons';
import { HomeRsvpTallySection } from './home/HomeRsvpTallySection';
import { ScheduleComments } from './home/ScheduleComments';

export interface ScheduleDetailBodyProps {
  schedule: Schedule;
  member: Member;
}

export const ScheduleDetailBody: React.FC<ScheduleDetailBodyProps> = ({ schedule, member }) => {
  const [isRosterOpen, setIsRosterOpen] = useState(false);
  const [currentNow, setCurrentNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentNow(new Date()), 10000);
    return () => clearInterval(timer);
  }, []);

  const allMembers = sheetsService.getMembers(true, true);
  const memberAliasIds = resolveMergedMemberIds(member.id, allMembers);
  const isRequired = isMemberRequiredForSchedule(
    member,
    schedule.date,
    schedule,
    memberAliasIds,
    allMembers
  );
  const kakaoMapLink = buildKakaoMapLink({
    address: findScheduleAddress(schedule, sheetsService.getLocationPresets()),
    name: schedule.locationName,
    lat: schedule.targetLat,
    lon: schedule.targetLon,
  });

  // Calculate RSVP and attendance tally
  const targetMembers = allMembers.filter(
    (m) =>
      m.status === 'ACTIVE' &&
      isMemberRequiredForSchedule(
        m,
        schedule.date,
        schedule,
        resolveMergedMemberIds(m.id, allMembers),
        allMembers
      )
  );
  const votes = sheetsService.getRSVPVotes(schedule.id);
  const reconciled = sheetsService.reconcileAttendance(schedule.id, currentNow);
  const attendedMemberIds = new Set(
    reconciled
      .filter((r) => r.finalStatus === '출석' || r.finalStatus === '지각' || r.finalStatus === '수동인정')
      .map((r) => r.memberId)
  );

  const tally = buildRsvpTally({ targetMembers, votes, attendedMemberIds });
  const targetIds = new Set(targetMembers.map((m) => m.id));
  const voluntaryAttendees = votes.filter((v) => v.status === 'ATTEND' && !targetIds.has(v.memberId));

  return (
    <div className="schedule-detail-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header Badges */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="schedule-category-badge">{schedule.category}</span>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: isRequired ? 'var(--brand-primary)' : 'var(--status-success)',
            background: isRequired ? 'var(--brand-primary-light)' : 'var(--status-success-light)',
            border: `1px solid ${isRequired ? 'var(--brand-primary)' : 'var(--status-success)'}`,
            padding: '2px 8px',
            borderRadius: 'var(--radius-full)',
          }}
        >
          {isRequired ? '필참' : '자율 참여'}
        </span>
        <span className="schedule-date-badge">{schedule.date}</span>
      </div>

      {/* Title */}
      <h2
        id="schedule-detail-title"
        className="schedule-card-title"
        style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}
      >
        {schedule.title}
      </h2>

      {/* Info: Time & Location */}
      <div className="schedule-info-grid">
        <div className="info-item">
          <span className="info-icon" aria-hidden="true">
            <IconClock size={16} />
          </span>
          <span className="info-text">
            {schedule.startTime} ~ {schedule.endTime}
          </span>
        </div>
        <div className="info-item">
          <span className="info-icon" aria-hidden="true">
            <IconLocation size={16} />
          </span>
          <span className="info-text">
            {kakaoMapLink ? (
              <a
                href={kakaoMapLink}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: 'var(--brand-lavender-text)',
                  textDecoration: 'underline',
                  wordBreak: 'break-all',
                }}
              >
                {schedule.locationName}
              </a>
            ) : (
              schedule.locationName || '장소 미정'
            )}
          </span>
        </div>
      </div>

      {/* Full Description */}
      {schedule.description && (
        <p className="schedule-desc-box" style={{ margin: 0 }}>
          {schedule.description}
        </p>
      )}

      {/* RSVP Tally and Comments Section */}
      <HomeRsvpTallySection
        mandatoryAttendees={tally.votedAttendees}
        onSiteAttendees={tally.onSiteAttendees}
        mandatoryAbsentees={tally.absentees}
        voluntaryAttendees={voluntaryAttendees}
        unvotedMembers={tally.unvotedMembers}
        totalTargetCount={targetMembers.length}
        isRosterOpen={isRosterOpen}
        onToggleRoster={() => setIsRosterOpen((prev) => !prev)}
        footer={
          <ScheduleComments
            key={schedule.id}
            scheduleId={schedule.id}
            author={{ id: member.id, name: member.name, part: member.part }}
          />
        }
      />
    </div>
  );
};
