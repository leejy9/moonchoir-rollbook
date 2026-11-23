import React from 'react';
import type { PracticeTrack } from '../../types/rollbook';
import { isVideoTrack } from '../../utils/youtubeUrl';

export interface PieceTracksCardProps {
  tracks: PracticeTrack[];
  activeTrackId: string | null;
  isActiveVideo: boolean;
  onSelectAudio: (track: PracticeTrack) => void;
  onSelectVideo: (track: PracticeTrack) => void;
}

function formatTrackDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/**
 * "이 곡의 음원" 카드 (MEMBER_UX_V3_SPEC.md §3-3-3, V25).
 * - 반투명 흰 바탕(8%) 둥근 카드
 * - 지금 곡의 모든 트랙(음원 + 유튜브), 트랙 순서대로
 * - 재생 중인 행: 라벤더 글자 + 막대 아이콘
 * - 유튜브 행: 어두운 사각 + 영상 아이콘, 둘째 줄 "영상"
 * - 음원 행: 둘째 줄 길이
 */
export const PieceTracksCard: React.FC<PieceTracksCardProps> = ({
  tracks,
  activeTrackId,
  isActiveVideo,
  onSelectAudio,
  onSelectVideo,
}) => {
  if (tracks.length === 0) return null;

  const sortedTracks = [...tracks].sort(
    (a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)
  );

  return (
    <div className="piece-tracks-card" role="region" aria-label="이 곡의 음원">
      <h3 className="piece-tracks-card-title">이 곡의 음원</h3>
      <div className="piece-tracks-list">
        {sortedTracks.map((track) => {
          const isVideo = isVideoTrack(track);
          const isCurrentActive =
            track.id === activeTrackId && (isVideo ? isActiveVideo : !isActiveVideo);

          const durationText = formatTrackDuration(track.durationSeconds);

          return (
            <button
              key={track.id}
              type="button"
              className={`piece-track-row ${isCurrentActive ? 'active' : ''}`}
              onClick={() => {
                if (isVideo) {
                  onSelectVideo(track);
                } else {
                  onSelectAudio(track);
                }
              }}
              aria-label={`${track.label} ${isVideo ? '영상 재생' : '음원 재생'}`}
            >
              {/* Icon / Thumbnail Box */}
              <div className={`piece-track-thumb ${isVideo ? 'video' : 'audio'}`} aria-hidden="true">
                {isVideo ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                )}
              </div>

              {/* Title & Subtitle */}
              <div className="piece-track-info">
                <div className="piece-track-label-row">
                  <span className="piece-track-label">{track.label}</span>
                  {isCurrentActive && (
                    <span className="piece-track-playing-badge" aria-label="재생 중">
                      <span className="playing-bar bar-1" />
                      <span className="playing-bar bar-2" />
                      <span className="playing-bar bar-3" />
                    </span>
                  )}
                </div>
                <span className="piece-track-sub">
                  {isVideo ? '영상' : durationText}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
