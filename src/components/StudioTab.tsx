import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { sheetsService } from '../services/sheets';
import { useAudioPlayer } from './audio/AudioPlayerProvider';
import { buildStudioView, resolveTrackPlayback, type StudioViewSection } from '../utils/practiceMedia';
import { buildAudioQueue } from '../utils/audioQueue';
import { isStandaloneDisplay } from '../utils/pwaInstall';
import type { PracticeTrack } from '../types/rollbook';

export interface StudioTabProps {
  onOpenAdmin?: () => void;
}

/**
 * 단원 연습실 탭 화면 (MEMBER_UX_AUDIO_SPEC.md §3-5).
 * - 탭 진입 시에만 최신 연습곡 카탈로그를 조회 (refreshPracticeCatalog)
 * - GAS 모드인 경우 "준비 중" 안내를 표시하고 원격 요청을 생략
 * - 활성 시즌 카드별로 곡과 트랙을 그룹화 (어떤 시즌에도 속하지 않은 곡은 숨김)
 * - 악보 링크는 새 창(target="_blank", rel="noopener noreferrer")으로 연결
 * - 트랙 출처에 따라 "재생" 또는 "외부에서 열기" 버튼 제공
 * - 파트 필터 없음 (D1 명세 준수)
 * - 모든 터치 영역 최소 44×44px 보장 및 이모지 0건
 */
export const StudioTab: React.FC<StudioTabProps> = () => {
  const [catalog, setCatalog] = useState(() => sheetsService.getPracticeCatalog());
  const programCards = sheetsService.getProgramCards();
  const config = sheetsService.getConfig();
  const backendKind = sheetsService.getBackendKind();
  const [isLoading, setIsLoading] = useState(false);

  const { playTrack, currentTrack, isPlaying, togglePlay } = useAudioPlayer();

  // 탭 진입 시에만 카탈로그 원격 갱신 (GAS 모드 제외)
  useEffect(() => {
    if (backendKind === 'gas') {
      return;
    }
    let isCancelled = false;
    // oxlint-disable-next-line react/set-state-in-effect
    setIsLoading(true);
    sheetsService
      .refreshPracticeCatalog()
      .then(() => {
        if (!isCancelled) {
          setCatalog(sheetsService.getPracticeCatalog());
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.warn('[StudioTab] refreshPracticeCatalog failed:', err);
        if (!isCancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [backendKind]);

  // iOS 홈 화면(PWA) 독립 앱 감지 (MEMBER_UX_AUDIO_SPEC.md §3-4)
  const isIosStandalone = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    return isIos && isStandaloneDisplay();
  }, []);

  // 시즌별 곡/트랙 뷰 모델 조립 (순수 함수: 등록된 곡이 있는 시즌 카드만 단원에 노출)
  const sections: StudioViewSection[] = useMemo(() => {
    return buildStudioView(catalog, programCards).filter((s) => s.pieces.length > 0);
  }, [catalog, programCards]);

  // 곡 제목 맵 (재생 큐 생성용)
  const pieceTitleMap = useMemo(() => {
    return new Map(catalog.pieces.map((p) => [p.id, p.title]));
  }, [catalog.pieces]);

  // 트랙 재생 핸들러
  const handlePlayTrack = useCallback(
    (track: PracticeTrack, section: StudioViewSection) => {
      // 해당 시즌의 모든 트랙으로 재생 큐 생성
      const sectionTracks = section.pieces.flatMap((p) => p.tracks);
      const queue = buildAudioQueue(sectionTracks, pieceTitleMap, config);
      const targetItem = queue.find((q) => q.track.id === track.id);

      if (targetItem) {
        if (currentTrack?.track.id === track.id) {
          togglePlay();
        } else {
          playTrack(targetItem, queue);
        }
      }
    },
    [pieceTitleMap, config, currentTrack, togglePlay, playTrack]
  );

  if (backendKind === 'gas') {
    return (
      <div className="tab-container studio-tab" style={{ padding: '24px 16px', textAlign: 'center' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '12px', color: 'var(--text-main, #0f172a)' }}>
          연습실
        </h2>
        <div
          style={{
            padding: '24px 16px',
            backgroundColor: 'var(--bg-card, #ffffff)',
            borderRadius: '8px',
            border: '1px solid var(--border-subtle, #e2e8f0)',
            color: 'var(--text-muted, #64748b)',
            fontSize: '14px',
            lineHeight: 1.6,
          }}
        >
          연습실 기능은 준비 중입니다.
          <br />
          음원 스트리밍 서비스 연동 후 제공될 예정입니다.
        </div>
      </div>
    );
  }

  return (
    <div
      className="tab-container studio-tab"
      style={{
        padding: '16px 16px calc(var(--bottom-chrome-h, 60px) + 24px) 16px',
        maxWidth: '480px',
        margin: '0 auto',
      }}
    >
      <header style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-main, #0f172a)', margin: 0 }}>
          연습실
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--text-muted, #64748b)', marginTop: '4px', marginBottom: 0 }}>
          시즌별 연습곡을 듣고 악보를 확인합니다.
        </p>
      </header>

      {/* iOS 홈 화면 앱 안내 배너 (MEMBER_UX_AUDIO_SPEC.md §3-4) */}
      {isIosStandalone && (
        <aside
          className="ios-standalone-banner"
          role="note"
          style={{
            marginBottom: '16px',
            padding: '12px 14px',
            backgroundColor: 'var(--bg-card, #ffffff)',
            border: '1px solid var(--border-subtle, #e2e8f0)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
          }}
        >
          <div style={{ fontSize: '13px', color: 'var(--text-main, #0f172a)', lineHeight: 1.4 }}>
            음원은 Safari에서 들으면 화면이 꺼져도 끊기지 않아요
          </div>
          <a
            href={typeof window !== 'undefined' ? window.location.href : '#/studio'}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              minHeight: '44px',
              minWidth: '44px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 12px',
              backgroundColor: 'var(--brand-accent, #3b82f6)',
              color: 'var(--text-white, #ffffff)',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              textDecoration: 'none',
              flexShrink: 0,
            }}
          >
            Safari로 열기
          </a>
        </aside>
      )}

      {isLoading && sections.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted, #64748b)' }}>
          연습곡 목록을 불러오는 중...
        </div>
      )}

      {!isLoading && sections.length === 0 && (
        <div
          style={{
            padding: '32px 16px',
            backgroundColor: 'var(--bg-card, #ffffff)',
            borderRadius: '8px',
            border: '1px solid var(--border-subtle, #e2e8f0)',
            textAlign: 'center',
            color: 'var(--text-muted, #64748b)',
            fontSize: '14px',
          }}
        >
          등록된 연습곡이 없습니다.
        </div>
      )}

      {sections.map((section) => (
        <section
          key={section.programCard.id}
          style={{
            marginBottom: '24px',
            backgroundColor: 'var(--bg-card, #ffffff)',
            borderRadius: '12px',
            border: '1px solid var(--border-subtle, #e2e8f0)',
            padding: '16px',
          }}
        >
          {/* 시즌 카드 헤더 */}
          <div style={{ borderBottom: '1px solid var(--border-subtle, #e2e8f0)', paddingBottom: '12px', marginBottom: '14px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main, #0f172a)', margin: 0 }}>
              {section.programCard.title}
            </h3>
            {section.programCard.description && (
              <p style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)', marginTop: '4px', marginBottom: 0 }}>
                {section.programCard.description}
              </p>
            )}
          </div>

          {/* 해당 시즌의 곡 목록 */}
          {section.pieces.length === 0 ? (
            <div style={{ fontSize: '13px', color: 'var(--text-muted, #94a3b8)', padding: '8px 0' }}>
              연결된 곡이 없습니다.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {section.pieces.map(({ piece, tracks }) => (
                <div
                  key={piece.id}
                  style={{
                    backgroundColor: 'var(--bg-subtle, #f8fafc)',
                    borderRadius: '8px',
                    padding: '12px',
                    border: '1px solid var(--border-subtle, #e2e8f0)',
                  }}
                >
                  {/* 곡 정보 및 악보 링크 */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '8px',
                    }}
                  >
                    <div>
                      <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main, #0f172a)', margin: 0 }}>
                        {piece.title}
                      </h4>
                      {(piece.composer || piece.arranger) && (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)', marginTop: '2px' }}>
                          {[piece.composer && `작곡: ${piece.composer}`, piece.arranger && `편곡: ${piece.arranger}`]
                            .filter(Boolean)
                            .join(' / ')}
                        </div>
                      )}
                    </div>

                    {piece.scoreUrl && (
                      <a
                        href={piece.scoreUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          minHeight: '44px',
                          minWidth: '44px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '0 10px',
                          backgroundColor: 'var(--bg-card, #ffffff)',
                          border: '1px solid var(--border-subtle, #cbd5e1)',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 500,
                          color: 'var(--brand-accent, #3b82f6)',
                          textDecoration: 'none',
                          flexShrink: 0,
                        }}
                      >
                        악보 보기
                      </a>
                    )}
                  </div>

                  {piece.notes && (
                    <p style={{ fontSize: '12px', color: 'var(--text-sub, #475569)', margin: '0 0 10px 0' }}>
                      {piece.notes}
                    </p>
                  )}

                  {/* 트랙 목록 */}
                  {tracks.length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted, #94a3b8)', padding: '4px 0' }}>
                      등록된 트랙이 없습니다.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {tracks.map((track) => {
                        const playback = resolveTrackPlayback(track, config);
                        const isCurrentPlaying =
                          currentTrack?.track.id === track.id && isPlaying;

                        return (
                          <div
                            key={track.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '6px 10px',
                              backgroundColor: 'var(--bg-card, #ffffff)',
                              borderRadius: '6px',
                              border: '1px solid var(--border-subtle, #e2e8f0)',
                            }}
                          >
                            <span style={{ fontSize: '13px', color: 'var(--text-main, #1e293b)' }}>
                              {track.label}
                            </span>

                            {playback.mode === 'audio' && (
                              <button
                                type="button"
                                onClick={() => handlePlayTrack(track, section)}
                                aria-label={isCurrentPlaying ? '일시정지' : '재생'}
                                style={{
                                  minHeight: '44px',
                                  minWidth: '44px',
                                  padding: '0 12px',
                                  backgroundColor: isCurrentPlaying
                                    ? 'var(--brand-accent, #3b82f6)'
                                    : 'var(--bg-subtle, #f1f5f9)',
                                  color: isCurrentPlaying ? 'var(--text-white, #ffffff)' : 'var(--text-main, #0f172a)',
                                  border: '1px solid var(--border-subtle, #cbd5e1)',
                                  borderRadius: '6px',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                {isCurrentPlaying ? '일시정지' : '재생'}
                              </button>
                            )}

                            {playback.mode === 'external_link' && (
                              <a
                                href={playback.src || track.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  minHeight: '44px',
                                  minWidth: '44px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  padding: '0 12px',
                                  backgroundColor: 'var(--bg-subtle, #f1f5f9)',
                                  color: 'var(--text-sub, #334155)',
                                  border: '1px solid var(--border-subtle, #cbd5e1)',
                                  borderRadius: '6px',
                                  fontSize: '12px',
                                  fontWeight: 500,
                                  textDecoration: 'none',
                                }}
                              >
                                외부에서 열기
                              </a>
                            )}

                            {playback.mode === 'unavailable' && (
                              <span
                                style={{
                                  minHeight: '44px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  fontSize: '12px',
                                  color: 'var(--text-muted, #94a3b8)',
                                }}
                              >
                                재생 불가
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
};
