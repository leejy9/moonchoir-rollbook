import React from 'react';
import type { AppConfig, PracticePiece, PracticeTrack, ProgramCard } from '../../types/rollbook';
import { useAudioPlayer } from '../audio/audioPlayerContext';
import { buildAudioQueue } from '../../utils/audioQueue';
import { resolveTrackPlayback } from '../../utils/practiceMedia';

export interface PieceDetailProps {
  piece: PracticePiece;
  tracks: PracticeTrack[];
  programCards: ProgramCard[];
  connectedProgramIds: string[];
  config: AppConfig;
  mediaPublicBaseUrl?: string;
  onBack: () => void;
  onOpenScore?: (piece: PracticePiece) => void;
}

export const PieceDetail: React.FC<PieceDetailProps> = ({
  piece,
  tracks,
  programCards,
  connectedProgramIds,
  config,
  mediaPublicBaseUrl,
  onBack,
  onOpenScore,
}) => {
  const { playTrack, currentTrack, isPlaying, togglePlay } = useAudioPlayer();

  const activeTracks = tracks.filter((t) => !t.isArchived);
  const audioTracks = activeTracks.filter((t) => t.source === 'r2' || (t.source !== 'youtube' && !t.url?.includes('youtube')));
  const videoTracks = activeTracks.filter((t) => t.source === 'youtube' || t.url?.includes('youtube'));

  // Program name line
  const connectedCard = programCards.find((c) => connectedProgramIds.includes(c.id));
  const subLineParts = [
    piece.composer,
    piece.arranger ? `편곡: ${piece.arranger}` : undefined,
    connectedCard?.title,
  ].filter(Boolean);

  const subLine = subLineParts.join(' · ');

  const handlePlay = (track: PracticeTrack) => {
    const pieceMap = new Map([[piece.id, piece.title]]);
    const queue = buildAudioQueue(audioTracks, pieceMap, config);
    const item = queue.find((q) => q.track.id === track.id);
    if (!item) return;

    if (currentTrack?.track.id === track.id) {
      togglePlay();
    } else {
      playTrack(item, queue);
    }
  };

  const handleScoreClick = () => {
    if (onOpenScore) {
      onOpenScore(piece);
      return;
    }
    const scoreUrl = piece.scoreStorageKey
      ? `${mediaPublicBaseUrl || config.mediaPublicBaseUrl || ''}/${piece.scoreStorageKey}`
      : piece.scoreUrl;
    if (scoreUrl) {
      window.open(scoreUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const hasScore = Boolean(piece.scoreStorageKey || piece.scoreUrl);

  return (
    <div className="studio-piece-detail" style={{ padding: '4px 0' }}>
      {/* Back button */}
      <button
        type="button"
        onClick={onBack}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          minHeight: '44px',
          minWidth: '44px',
          padding: '8px 0',
          border: 'none',
          background: 'transparent',
          color: 'var(--brand-primary)',
          fontSize: '14px',
          fontWeight: 700,
          cursor: 'pointer',
        }}
        aria-label="연습실 목록으로 돌아가기"
      >
        ‹ 연습실
      </button>

      {/* Piece Header */}
      <div style={{ margin: '8px 0 16px 0' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 4px 0' }}>
          {piece.title}
        </h2>
        {subLine && (
          <p style={{ fontSize: '13px', color: 'var(--text-sub)', margin: 0 }}>
            {subLine}
          </p>
        )}
      </div>

      {/* Score Card */}
      {hasScore && (
        <section
          style={{
            marginBottom: '16px',
            padding: '14px',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-card)',
          }}
          aria-label="악보"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>
              악보
            </span>
            <button
              type="button"
              onClick={handleScoreClick}
              style={{
                minHeight: '44px',
                minWidth: '44px',
                padding: '6px 14px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--brand-primary)',
                color: 'var(--text-white)',
                fontSize: '13px',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              악보 보기
            </button>
          </div>
        </section>
      )}

      {/* Audio Tracks Card */}
      <section
        style={{
          marginBottom: '16px',
          padding: '14px',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)',
          background: 'var(--bg-card)',
        }}
        aria-label="음원 목록"
      >
        <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)', margin: '0 0 12px 0' }}>
          음원
        </h3>

        {audioTracks.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
            등록된 음원이 없습니다.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {audioTracks.map((trk) => {
              const isCurrentPlaying = currentTrack?.track.id === trk.id && isPlaying;
              const playback = resolveTrackPlayback(trk, config);

              return (
                <div
                  key={trk.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    background: isCurrentPlaying ? 'var(--brand-primary-light)' : 'var(--bg-subtle)',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>
                      {trk.label}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {trk.kind}
                    </span>
                  </div>

                  {playback.mode === 'audio' && (
                    <button
                      type="button"
                      onClick={() => handlePlay(trk)}
                      style={{
                        minHeight: '44px',
                        minWidth: '44px',
                        padding: '6px 14px',
                        borderRadius: 'var(--radius-md)',
                        background: isCurrentPlaying ? 'var(--brand-primary)' : 'var(--bg-card)',
                        color: isCurrentPlaying ? 'var(--text-white)' : 'var(--text-main)',
                        border: '1px solid var(--border-subtle)',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                      aria-label={isCurrentPlaying ? `${trk.label} 일시정지` : `${trk.label} 재생`}
                    >
                      {isCurrentPlaying ? '일시정지' : '재생'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Videos / YouTube Card (V3-05) */}
      {videoTracks.length > 0 && (
        <section
          style={{
            marginBottom: '16px',
            padding: '14px',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-card)',
          }}
          aria-label="참고 영상"
        >
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)', margin: '0 0 12px 0' }}>
            참고 영상
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {videoTracks.map((v) => (
              <div
                key={v.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-subtle)',
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>
                  {v.label}
                </span>

                {v.url && (
                  <a
                    href={v.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="유튜브 앱으로 열기"
                    style={{
                      minHeight: '44px',
                      minWidth: '44px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '6px 12px',
                      borderRadius: 'var(--radius-md)',
                      background: '#ff0000',
                      color: '#ffffff',
                      textDecoration: 'none',
                      fontSize: '12px',
                      fontWeight: 700,
                    }}
                  >
                    YouTube
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
