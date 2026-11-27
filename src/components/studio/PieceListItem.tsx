import React from 'react';
import type { PracticePiece, PracticeTrack } from '../../types/rollbook';
import { addDaysKST } from '../../utils/date';
import { isVideoTrack } from '../../utils/youtubeUrl';

export interface PieceListItemProps {
  piece: PracticePiece;
  tracks: PracticeTrack[];
  orderNumber?: number;
  todayStr: string;
  onClick: () => void;
}

export const PieceListItem: React.FC<PieceListItemProps> = ({
  piece,
  tracks,
  orderNumber,
  todayStr,
  onClick,
}) => {
  const activeTracks = tracks.filter((t) => !t.isArchived);

  // Audio tracks vs video tracks
  const audioTracks = activeTracks.filter((t) => !isVideoTrack(t));
  const videoTracks = activeTracks.filter((t) => isVideoTrack(t));

  const hasScore = Boolean(piece.scoreStorageKey || piece.scoreUrl);

  // 7 days check for "새 음원"
  const sevenDaysAgo = addDaysKST(todayStr, -7);
  const hasNewTrack = activeTracks.some((t) => (t.createdAt || '') >= sevenDaysAgo);

  const subLine = [
    piece.composer && `작곡: ${piece.composer}`,
    piece.arranger && `편곡: ${piece.arranger}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className="studio-piece-row"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={`${piece.title} 상세 보기`}
    >
      {orderNumber !== undefined && (
        <span className="studio-piece-order">{orderNumber}</span>
      )}

      <div className="studio-piece-info">
        <span className="studio-piece-title">{piece.title}</span>
        {subLine && <span className="studio-piece-sub">{subLine}</span>}

        <div className="studio-piece-badges">
          {hasNewTrack && (
            <span className="studio-badge badge-new">새 음원</span>
          )}
          {hasScore && (
            <span className="studio-badge">악보</span>
          )}
          {audioTracks.length > 0 && (
            <span className="studio-badge">음원 {audioTracks.length}</span>
          )}
          {videoTracks.length > 0 && (
            <span className="studio-badge">영상 {videoTracks.length}</span>
          )}
        </div>
      </div>
    </div>
  );
};
