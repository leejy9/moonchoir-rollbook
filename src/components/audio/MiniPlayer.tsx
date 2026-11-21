import React from 'react';
import { useAudioPlayer, useAudioPosition } from './AudioPlayerProvider';

function formatSeconds(sec: number): string {
  if (Number.isNaN(sec) || sec < 0) return '0:00';
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

const MiniPlayerTimeDisplay: React.FC<{ label: string }> = ({ label }) => {
  const { currentTime, duration } = useAudioPosition();
  return (
    <>
      {label} · {formatSeconds(currentTime)} / {formatSeconds(duration)}
    </>
  );
};

/**
 * 56px 높이의 모바일 최적화 미니 오디오 플레이어 (MEMBER_UX_AUDIO_SPEC.md §3-4).
 * - BottomNav 바로 위에 고정 (Safe Area 완벽 대응)
 * - 모든 클릭 영역 최소 44×44px 터치 타깃 보장
 * - 순수 텍스트 라벨 (이모지 엄격 금지)
 * - 자동 재생 차단 시 "탭하여 다시 재생" 복구 버튼 제공
 */
export const MiniPlayer: React.FC = () => {
  const {
    currentTrack,
    isPlaying,
    isBlocked,
    playbackSpeed,
    repeatOne,
    togglePlay,
    resume,
    seekRelative,
    cycleSpeed,
    toggleRepeatOne,
    closePlayer,
  } = useAudioPlayer();

  if (!currentTrack) {
    return null;
  }

  return (
    <div
      className="mini-player"
      role="region"
      aria-label="오디오 플레이어"
      style={{
        position: 'fixed',
        bottom: 'calc(var(--bottom-nav-h, 56px) + env(safe-area-inset-bottom, 0px))',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: '480px',
        height: '56px',
        backgroundColor: 'var(--bg-card, #ffffff)',
        borderTop: '1px solid var(--border-subtle, #e2e8f0)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 8px',
        zIndex: 99,
        boxSizing: 'border-box',
      }}
    >
      {isBlocked ? (
        <button
          type="button"
          onClick={resume}
          aria-label="탭하여 다시 재생"
          style={{
            flex: 1,
            minHeight: '44px',
            minWidth: '44px',
            backgroundColor: 'var(--brand-accent, #3b82f6)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          탭하여 다시 재생
        </button>
      ) : (
        <>
          {/* 곡 및 트랙 정보 */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              marginRight: '6px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--text-main, #0f172a)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {currentTrack.pieceTitle}
            </div>
            <div
              style={{
                fontSize: '11px',
                color: 'var(--text-muted, #64748b)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              <MiniPlayerTimeDisplay label={currentTrack.track.label} />
            </div>
          </div>

          {/* 재생 컨트롤 (-10초, 재생/정지, +10초, 배속, 반복, 닫기) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => seekRelative(-10)}
              aria-label="10초 뒤로"
              style={{
                minWidth: '44px',
                minHeight: '44px',
                padding: '0 4px',
                background: 'transparent',
                border: 'none',
                fontSize: '11px',
                color: 'var(--text-secondary, #334155)',
                cursor: 'pointer',
              }}
            >
              -10
            </button>

            <button
              type="button"
              onClick={togglePlay}
              aria-label={isPlaying ? '일시정지' : '재생'}
              style={{
                minWidth: '44px',
                minHeight: '44px',
                padding: '0 8px',
                backgroundColor: 'var(--bg-subtle, #f1f5f9)',
                border: '1px solid var(--border-subtle, #cbd5e1)',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-main, #0f172a)',
                cursor: 'pointer',
              }}
            >
              {isPlaying ? '일시정지' : '재생'}
            </button>

            <button
              type="button"
              onClick={() => seekRelative(10)}
              aria-label="10초 앞으로"
              style={{
                minWidth: '44px',
                minHeight: '44px',
                padding: '0 4px',
                background: 'transparent',
                border: 'none',
                fontSize: '11px',
                color: 'var(--text-secondary, #334155)',
                cursor: 'pointer',
              }}
            >
              +10
            </button>

            <button
              type="button"
              onClick={cycleSpeed}
              aria-label="재생 배속"
              style={{
                minWidth: '44px',
                minHeight: '44px',
                padding: '0 2px',
                background: 'transparent',
                border: 'none',
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--text-secondary, #334155)',
                cursor: 'pointer',
              }}
            >
              {playbackSpeed === 1 ? '1.0x' : `${playbackSpeed}x`}
            </button>

            <button
              type="button"
              onClick={toggleRepeatOne}
              aria-label={repeatOne ? '1곡 반복 켜짐' : '1곡 반복 꺼짐'}
              style={{
                minWidth: '44px',
                minHeight: '44px',
                padding: '0 2px',
                background: 'transparent',
                border: 'none',
                fontSize: '11px',
                color: repeatOne ? 'var(--brand-accent, #3b82f6)' : 'var(--text-muted, #94a3b8)',
                fontWeight: repeatOne ? 700 : 400,
                cursor: 'pointer',
              }}
            >
              {repeatOne ? '1곡' : '전체'}
            </button>

            <button
              type="button"
              onClick={closePlayer}
              aria-label="플레이어 닫기"
              style={{
                minWidth: '44px',
                minHeight: '44px',
                padding: '0 4px',
                background: 'transparent',
                border: 'none',
                fontSize: '11px',
                color: 'var(--text-muted, #94a3b8)',
                cursor: 'pointer',
              }}
            >
              닫기
            </button>
          </div>
        </>
      )}
    </div>
  );
};
