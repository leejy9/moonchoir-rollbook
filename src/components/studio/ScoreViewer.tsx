import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import { sheetsService } from '../../services/sheets';
import { calculateDistance, type Point } from '../../utils/pinchZoom';
import { useOptionalAudioPlayer } from '../audio/audioPlayerContext';
import '../../styles/v3/score.css';

export interface ScoreViewerProps {
  pieceId: string;
  onClose: () => void;
}

interface ViewerInstance {
  setDocument: (doc: PDFDocumentProxy | null) => void;
  currentPageNumber: number;
  currentScaleValue: string;
  currentScale: number;
  increaseScale: () => void;
  decreaseScale: () => void;
  updateScale: (options: { scaleFactor?: number; origin?: number[]; drawingDelay?: number }) => void;
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
  const [zoomRatio, setZoomRatio] = useState(1.0);

  const containerRef = useRef<HTMLDivElement>(null);
  const viewerDivRef = useRef<HTMLDivElement>(null);
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const viewerInstanceRef = useRef<ViewerInstance | null>(null);
  const baseScaleRef = useRef<number>(1.0);

  useEffect(() => {
    let isCancelled = false;
    const container = containerRef.current;
    const innerDiv = viewerDivRef.current;

    if (!storageUrl || !container || !innerDiv) return;

    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        // 필수: pdf_viewer.mjs는 불러오는 순간 globalThis.pdfjsLib에서 값을 꺼낸다(6.5.438 기준 91행).
        (globalThis as { pdfjsLib?: typeof pdfjs }).pdfjsLib = pdfjs;
        const viewerMod = await import('pdfjs-dist/web/pdf_viewer.mjs');
        await import('pdfjs-dist/web/pdf_viewer.css');
        pdfjs.GlobalWorkerOptions.workerSrc = (
          await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
        ).default;

        if (isCancelled) return;

        const eventBus = new viewerMod.EventBus();
        const viewer = new viewerMod.PDFViewer({
          container,
          viewer: innerDiv,
          eventBus,
          textLayerMode: 0,
          annotationMode: 0,
          removePageBorders: true,
          maxCanvasPixels: 16_000_000,
        });

        viewerInstanceRef.current = viewer;

        eventBus.on('pagesinit', () => {
          if (isCancelled) return;
          viewer.currentScaleValue = 'page-width';
          baseScaleRef.current = viewer.currentScale || 1.0;
          setZoomRatio(1.0);
        });

        eventBus.on('pagechanging', (e: { pageNumber: number }) => {
          if (!isCancelled) {
            setCurrentPage(e.pageNumber);
          }
        });

        const task = pdfjs.getDocument({ url: storageUrl });
        loadingTaskRef.current = task;
        const doc = await task.promise;
        if (isCancelled) {
          void task.destroy();
          return;
        }

        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        setCurrentPage(1);
        viewer.setDocument(doc);
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
      if (viewerInstanceRef.current) {
        try {
          viewerInstanceRef.current.setDocument(null);
        } catch (err) {
          console.warn('[ScoreViewer] Failed to reset viewer document:', err);
        }
        viewerInstanceRef.current = null;
      }
      if (pdfDocRef.current) {
        try {
          void pdfDocRef.current.cleanup();
        } catch (err) {
          console.warn('[ScoreViewer] Failed to cleanup pdf document:', err);
        }
        pdfDocRef.current = null;
      }
      if (loadingTaskRef.current) {
        try {
          void loadingTaskRef.current.destroy();
        } catch (err) {
          console.warn('[ScoreViewer] Failed to destroy loading task:', err);
        }
        loadingTaskRef.current = null;
      }
    };
  }, [storageUrl]);

  // Touch & Pinch gestures on container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let lastDistance = 0;
    let lastTapTime = 0;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const p1: Point = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        const p2: Point = { x: e.touches[1].clientX, y: e.touches[1].clientY };
        lastDistance = calculateDistance(p1, p2);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const viewer = viewerInstanceRef.current;
        if (!viewer) return;

        const p1: Point = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        const p2: Point = { x: e.touches[1].clientX, y: e.touches[1].clientY };
        const currentDistance = calculateDistance(p1, p2);

        if (lastDistance > 0) {
          let scaleFactor = currentDistance / lastDistance;
          const rect = container.getBoundingClientRect();
          const originX = (p1.x + p2.x) / 2 - rect.left;
          const originY = (p1.y + p2.y) / 2 - rect.top;

          const base = baseScaleRef.current || 1.0;
          const targetScale = viewer.currentScale * scaleFactor;
          if (targetScale < base * 1.0) {
            scaleFactor = (base * 1.0) / viewer.currentScale;
          } else if (targetScale > base * 3.0) {
            scaleFactor = (base * 3.0) / viewer.currentScale;
          }

          if (Math.abs(scaleFactor - 1.0) > 0.002) {
            viewer.updateScale({
              scaleFactor,
              origin: [originX, originY],
              drawingDelay: 400,
            });
            setZoomRatio(viewer.currentScale / base);
          }
        }
        lastDistance = currentDistance;
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        lastDistance = 0;
        const viewer = viewerInstanceRef.current;
        if (viewer) {
          const base = baseScaleRef.current || 1.0;
          if (viewer.currentScale < base * 1.0) {
            viewer.currentScaleValue = 'page-width';
            setZoomRatio(1.0);
          } else {
            setZoomRatio(viewer.currentScale / base);
          }
        }
      }

      if (e.changedTouches.length === 1 && e.touches.length === 0) {
        const now = Date.now();
        if (now - lastTapTime < 300) {
          const viewer = viewerInstanceRef.current;
          if (viewer) {
            const base = baseScaleRef.current || 1.0;
            if (viewer.currentScale > base * 1.2) {
              viewer.currentScaleValue = 'page-width';
              setZoomRatio(1.0);
            } else {
              viewer.currentScale = base * 2.0;
              setZoomRatio(2.0);
            }
          }
          lastTapTime = 0;
        } else {
          lastTapTime = now;
        }
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);
    container.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, []);

  const handleZoomIn = useCallback(() => {
    const viewer = viewerInstanceRef.current;
    if (!viewer) return;
    viewer.increaseScale();
    const base = baseScaleRef.current || 1.0;
    if (viewer.currentScale > base * 3.0) {
      viewer.currentScale = base * 3.0;
    }
    setZoomRatio(viewer.currentScale / base);
  }, []);

  const handleZoomOut = useCallback(() => {
    const viewer = viewerInstanceRef.current;
    if (!viewer) return;
    viewer.decreaseScale();
    const base = baseScaleRef.current || 1.0;
    if (viewer.currentScale <= base * 1.0) {
      viewer.currentScaleValue = 'page-width';
      setZoomRatio(1.0);
    } else {
      setZoomRatio(viewer.currentScale / base);
    }
  }, []);

  const handlePrevPage = useCallback(() => {
    const viewer = viewerInstanceRef.current;
    if (!viewer) return;
    const target = Math.max(1, currentPage - 1);
    viewer.currentPageNumber = target;
    setCurrentPage(target);
  }, [currentPage]);

  const handleNextPage = useCallback(() => {
    const viewer = viewerInstanceRef.current;
    if (!viewer) return;
    const target = Math.min(numPages, currentPage + 1);
    viewer.currentPageNumber = target;
    setCurrentPage(target);
  }, [currentPage, numPages]);

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
            onClick={handleZoomOut}
            disabled={zoomRatio <= 1.05}
            aria-label="축소"
          >
            −
          </button>
          <button
            type="button"
            className="score-viewer-zoom-btn"
            onClick={handleZoomIn}
            disabled={zoomRatio >= 2.95}
            aria-label="확대"
          >
            +
          </button>
        </div>
      </header>

      {/* 2. PDF Viewer Container */}
      <div className="score-viewer-body">
        {loading && (
          <div className="score-viewer-loading score-viewer-loading-overlay">
            악보를 불러오는 중...
          </div>
        )}

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

        <div
          ref={containerRef}
          className="score-viewer-pdf-container"
          style={{ visibility: loading || error ? 'hidden' : 'visible' }}
        >
          <div ref={viewerDivRef} className="pdfViewer" />
        </div>
      </div>

      {/* 3. Bottom Pagination */}
      {!loading && !error && numPages > 0 && (
        <footer className="score-viewer-bottom-bar">
          <button
            type="button"
            className="score-viewer-nav-btn"
            onClick={handlePrevPage}
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
            onClick={handleNextPage}
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
