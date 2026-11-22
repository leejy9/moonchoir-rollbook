import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { sheetsService } from '../../services/sheets';
import {
  calculateCenter,
  calculateDistance,
  clampCanvasResolution,
  clampScale,
  clampTranslation,
  computePinchStep,
  type Point,
} from '../../utils/pinchZoom';
import { useOptionalAudioPlayer } from '../audio/audioPlayerContext';
import '../../styles/v3/score.css';

export interface ScoreViewerProps {
  pieceId: string;
  onClose: () => void;
}

export const ScoreViewer: React.FC<ScoreViewerProps> = ({ pieceId, onClose }) => {
  const audioPlayer = useOptionalAudioPlayer();
  const currentTrack = audioPlayer?.currentTrack;
  const catalog = sheetsService.getPracticeCatalog();
  const piece = catalog.pieces.find((p) => p.id === pieceId);
  const config = sheetsService.getConfig();

  const storageUrl = piece?.scoreStorageKey
    ? `${config.mediaPublicBaseUrl || ''}/${piece.scoreStorageKey}`
    : null;

  const [loading, setLoading] = useState(() => Boolean(storageUrl));
  const [error, setError] = useState(() => !storageUrl);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [renderScale, setRenderScale] = useState(1.0);
  const [translate, setTranslate] = useState<Point>({ x: 0, y: 0 });

  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef<Map<number, Point>>(new Map());
  const pinchStartRef = useRef<{ dist: number; scale: number; focal: Point; translate: Point } | null>(null);
  const panStartRef = useRef<{ x: number; y: number; translate: Point } | null>(null);
  const lastTapTimeRef = useRef<number>(0);
  const debounceTimerRef = useRef<number | null>(null);
  const pageRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());

  const scheduleRenderScale = useCallback((targetScale: number) => {
    if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = window.setTimeout(() => setRenderScale(targetScale), 300);
  }, []);

  const updateScale = useCallback((nextScale: number) => {
    const clamped = clampScale(nextScale);
    setScale(clamped);
    if (clamped <= 1.0) {
      setTranslate({ x: 0, y: 0 });
    } else if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setTranslate((prev) => clampTranslation(prev.x, prev.y, clamped, { width: rect.width, height: rect.height }));
    }
    scheduleRenderScale(clamped);
  }, [scheduleRenderScale]);

  useEffect(() => {
    let isCancelled = false;
    if (!storageUrl) return;

    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

        const doc = await pdfjs.getDocument({ url: storageUrl }).promise;
        if (isCancelled) {
          doc.loadingTask?.destroy();
          return;
        }
        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        setCurrentPage(1);
        setLoading(false);
      } catch (err) {
        console.warn('[ScoreViewer] Failed to load PDF:', err);
        if (!isCancelled) {
          setError(true);
          setLoading(false);
        }
      }
    })();

    return () => {
      isCancelled = true;
      if (pdfDocRef.current) {
        pdfDocRef.current.loadingTask?.destroy();
        pdfDocRef.current = null;
      }
      if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    };
  }, [storageUrl]);

  const renderPage = useCallback(async (pageNumber: number, canvas: HTMLCanvasElement) => {
    const doc = pdfDocRef.current;
    if (!doc) return;
    try {
      const page = await doc.getPage(pageNumber);
      const containerWidth = containerRef.current?.clientWidth || 360;
      const unscaledViewport = page.getViewport({ scale: 1.0 });
      const baseFitScale = (containerWidth - 32) / unscaledViewport.width;
      const targetScale = Math.max(0.5, baseFitScale) * renderScale;

      const { scale: safeScale, effectiveDpr } = clampCanvasResolution(
        unscaledViewport.width,
        unscaledViewport.height,
        targetScale,
        window.devicePixelRatio || 1
      );

      const viewport = page.getViewport({ scale: safeScale * effectiveDpr });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${Math.floor(viewport.width / effectiveDpr)}px`;
      canvas.style.height = `${Math.floor(viewport.height / effectiveDpr)}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) await page.render({ canvas, viewport }).promise;
    } catch (err) {
      console.warn(`[ScoreViewer] Error rendering page ${pageNumber}:`, err);
    }
  }, [renderScale]);

  useEffect(() => {
    if (!pdfDocRef.current || numPages === 0) return;
    const targetPages = [currentPage, currentPage + 1].filter((p) => p <= numPages);
    for (const p of targetPages) {
      const canvas = pageRefs.current.get(p);
      if (canvas) void renderPage(p, canvas);
    }
  }, [currentPage, numPages, renderPage]);

  const scrollToPage = useCallback((pageNum: number) => {
    const targetPage = Math.max(1, Math.min(pageNum, numPages));
    setCurrentPage(targetPage);
    const canvas = pageRefs.current.get(targetPage);
    if (canvas && containerRef.current) {
      canvas.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [numPages]);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const containerTop = containerRef.current.scrollTop;
    let closestPage = 1;
    let minDistance = Infinity;

    pageRefs.current.forEach((canvas, pageNum) => {
      const distance = Math.abs(canvas.offsetTop - containerTop);
      if (distance < minDistance) {
        minDistance = distance;
        closestPage = pageNum;
      }
    });
    if (closestPage !== currentPage) setCurrentPage(closestPage);
  }, [currentPage]);

  const handlePointerDown = (e: React.PointerEvent) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 1) {
      const now = Date.now();
      if (now - lastTapTimeRef.current < 300) {
        updateScale(scale > 1.0 ? 1.0 : 2.0);
        lastTapTimeRef.current = 0;
        return;
      }
      lastTapTimeRef.current = now;
      if (scale > 1.0) {
        panStartRef.current = { x: e.clientX, y: e.clientY, translate: { ...translate } };
      }
    } else if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      pinchStartRef.current = {
        dist: calculateDistance(pts[0], pts[1]),
        scale,
        focal: calculateCenter(pts[0], pts[1]),
        translate: { ...translate },
      };
      panStartRef.current = null;
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2 && pinchStartRef.current && containerRef.current) {
      const pts = Array.from(pointersRef.current.values());
      const rect = containerRef.current.getBoundingClientRect();
      const step = computePinchStep({
        initialDistance: pinchStartRef.current.dist,
        currentDistance: calculateDistance(pts[0], pts[1]),
        initialScale: pinchStartRef.current.scale,
        focalPoint: pinchStartRef.current.focal,
        initialTranslate: pinchStartRef.current.translate,
        container: { width: rect.width, height: rect.height },
      });
      setScale(step.scale);
      setTranslate({ x: step.translateX, y: step.translateY });
    } else if (pointersRef.current.size === 1 && panStartRef.current && scale > 1.0 && containerRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      const rect = containerRef.current.getBoundingClientRect();
      setTranslate(clampTranslation(
        panStartRef.current.translate.x + dx,
        panStartRef.current.translate.y + dy,
        scale,
        { width: rect.width, height: rect.height }
      ));
    }
  };

  const handlePointerUpOrCancel = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) {
      pinchStartRef.current = null;
      scheduleRenderScale(scale);
    }
    if (pointersRef.current.size === 0) panStartRef.current = null;
  };

  const handleOpenExternal = () => {
    const url = piece?.scoreUrl || storageUrl;
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="score-viewer-overlay" role="dialog" aria-modal="true" aria-label="악보 보기">
      {/* 1. Header */}
      <header className="score-viewer-header">
        <div className="score-viewer-header-left">
          <button type="button" className="score-viewer-back-btn" onClick={onClose} aria-label="닫기">
            ‹
          </button>
          <h2 className="score-viewer-title">{piece?.title || '악보'}</h2>
        </div>
        <div className="score-viewer-header-right">
          <button
            type="button"
            className="score-viewer-zoom-btn"
            onClick={() => updateScale(scale - 0.5)}
            disabled={scale <= 1.0}
            aria-label="축소"
          >
            −
          </button>
          <button
            type="button"
            className="score-viewer-zoom-btn"
            onClick={() => updateScale(scale + 0.5)}
            disabled={scale >= 3.0}
            aria-label="확대"
          >
            +
          </button>
        </div>
      </header>

      {/* 2. Content */}
      {loading && <div className="score-viewer-loading">악보를 불러오는 중...</div>}

      {error && !loading && (
        <div className="score-viewer-error">
          <p className="score-viewer-error-text">악보를 열 수 없어요</p>
          {(piece?.scoreUrl || storageUrl) && (
            <button type="button" className="score-viewer-error-btn" onClick={handleOpenExternal}>
              새 탭에서 열기
            </button>
          )}
        </div>
      )}

      {!loading && !error && (
        <div
          ref={containerRef}
          className={`score-viewer-content ${scale > 1.0 ? 'zoomed' : ''}`}
          onScroll={handleScroll}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUpOrCancel}
          onPointerCancel={handlePointerUpOrCancel}
        >
          <div
            className="score-viewer-transform-layer"
            style={{ transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale / renderScale})` }}
          >
            {Array.from({ length: numPages }, (_, idx) => {
              const pageNum = idx + 1;
              const isVisible = Math.abs(pageNum - currentPage) <= 1;
              return (
                <div key={pageNum} className="score-viewer-page">
                  {isVisible ? (
                    <canvas
                      ref={(el) => {
                        if (el) {
                          pageRefs.current.set(pageNum, el);
                          void renderPage(pageNum, el);
                        } else {
                          pageRefs.current.delete(pageNum);
                        }
                      }}
                    />
                  ) : (
                    <div className="score-viewer-page-placeholder" style={{ width: '320px', height: '450px' }}>
                      {pageNum}쪽
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Bottom Pagination */}
      {!loading && !error && numPages > 0 && (
        <footer className="score-viewer-bottom-bar">
          <button
            type="button"
            className="score-viewer-nav-btn"
            onClick={() => scrollToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            aria-label="이전 쪽"
          >
            ‹
          </button>
          <span className="score-viewer-page-info">
            {currentPage} / {numPages}
          </span>
          <button
            type="button"
            className="score-viewer-nav-btn"
            onClick={() => scrollToPage(currentPage + 1)}
            disabled={currentPage >= numPages}
            aria-label="다음 쪽"
          >
            ›
          </button>
        </footer>
      )}

      {/* Spacer when mini player is active */}
      {currentTrack && <div className="score-viewer-mini-spacer" />}
    </div>
  );
};
