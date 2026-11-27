import { act } from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { ScoreViewer } from './ScoreViewer';
import { sheetsService } from '../../services/sheets';
import { AudioPlayerContext, type AudioPlayerContextValue } from '../audio/audioPlayerContext';
import type { AppConfig, PracticePiece } from '../../types/rollbook';
import type { PlayableTrackItem } from '../../utils/audioQueue';

class MockElement {
  nodeType = 1;
  nodeName: string;
  tagName: string;
  childNodes: MockElement[] = [];
  style: Record<string, string> = {};
  ownerDocument: unknown;
  textContent = '';
  eventListeners: Record<string, ((e: unknown) => void)[]> = {};

  constructor(tag = 'DIV', doc?: unknown) {
    this.nodeName = tag;
    this.tagName = tag;
    this.ownerDocument = doc || (globalThis as unknown as { document: unknown })?.document;
  }

  appendChild(child: MockElement) {
    this.childNodes.push(child);
    return child;
  }

  removeChild(child: MockElement) {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) this.childNodes.splice(idx, 1);
    return child;
  }

  insertBefore(child: MockElement) {
    this.childNodes.push(child);
    return child;
  }

  addEventListener(event: string, handler: (e: unknown) => void) {
    if (!this.eventListeners[event]) this.eventListeners[event] = [];
    this.eventListeners[event].push(handler);
  }

  removeEventListener(event: string, handler: (e: unknown) => void) {
    const arr = this.eventListeners[event];
    if (arr) {
      const idx = arr.indexOf(handler);
      if (idx !== -1) arr.splice(idx, 1);
    }
  }

  dispatchEvent(event: { type: string }) {
    this.eventListeners[event.type]?.forEach((cb) => cb(event));
    return true;
  }

  setAttribute() {}
  removeAttribute() {}
  focus() {}
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 400, height: 600, right: 400, bottom: 600, x: 0, y: 0, toJSON: () => ({}) };
  }
}

class MockHTMLIFrameElement extends MockElement {}

// Track mocked PDFViewer instances
interface MockPDFViewerInstance {
  setDocument: ReturnType<typeof vi.fn>;
  currentPageNumber: number;
  currentScaleValue: string;
  currentScale: number;
  increaseScale: ReturnType<typeof vi.fn>;
  decreaseScale: ReturnType<typeof vi.fn>;
  updateScale: ReturnType<typeof vi.fn>;
}

let lastMockViewer: MockPDFViewerInstance | null = null;
let lastEventBus: { on: (event: string, handler: (data?: unknown) => void) => void; emit: (event: string, data?: unknown) => void } | null = null;
let pdfjsLibAtViewerInit: unknown = null;
const mockTaskDestroy = vi.fn();
const mockDocCleanup = vi.fn();

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn().mockImplementation(() => ({
    promise: Promise.resolve({
      numPages: 5,
      cleanup: mockDocCleanup,
    }),
    destroy: mockTaskDestroy,
  })),
}));

vi.mock('pdfjs-dist/web/pdf_viewer.mjs', () => {
  return {
    EventBus: class {
      private handlers: Record<string, ((data?: unknown) => void)[]> = {};
      constructor() {
        pdfjsLibAtViewerInit = (globalThis as { pdfjsLib?: unknown }).pdfjsLib;
        if (!pdfjsLibAtViewerInit) {
          throw new TypeError("Cannot destructure property 'AbortException' of 'globalThis.pdfjsLib'");
        }
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        lastEventBus = this;
      }
      on(event: string, handler: (data?: unknown) => void) {
        if (!this.handlers[event]) this.handlers[event] = [];
        this.handlers[event].push(handler);
      }
      emit(event: string, data?: unknown) {
        this.handlers[event]?.forEach((h) => h(data));
      }
    },
    PDFViewer: class implements MockPDFViewerInstance {
      setDocument = vi.fn();
      currentPageNumber = 1;
      currentScaleValue = 'auto';
      currentScale = 1.0;
      increaseScale = vi.fn();
      decreaseScale = vi.fn();
      updateScale = vi.fn();
      constructor() {
        if (!(globalThis as { pdfjsLib?: unknown }).pdfjsLib) {
          throw new TypeError("Cannot destructure property 'AbortException' of 'globalThis.pdfjsLib'");
        }
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        lastMockViewer = this;
      }
    },
  };
});

vi.mock('pdfjs-dist/web/pdf_viewer.css', () => ({}));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'mock-worker-url' }));

function setupMockDom() {
  const mockWin: Record<string, unknown> = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    HTMLIFrameElement: MockHTMLIFrameElement,
    HTMLElement: MockElement,
    Element: MockElement,
  };

  const mockDoc: Record<string, unknown> = {
    nodeType: 9,
    nodeName: '#document',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    activeElement: null,
    visibilityState: 'visible',
    defaultView: mockWin,
  };
  mockWin.document = mockDoc;
  mockDoc.documentElement = new MockElement('HTML', mockDoc);
  mockDoc.body = new MockElement('BODY', mockDoc);
  mockDoc.createElement = (tag: string) => new MockElement(tag.toUpperCase(), mockDoc);
  mockDoc.createElementNS = (_: unknown, tag: string) => new MockElement(tag.toUpperCase(), mockDoc);
  mockDoc.createTextNode = (text: string) => ({ nodeType: 3, nodeValue: text, ownerDocument: mockDoc });
  mockDoc.createComment = () => ({ nodeType: 8, ownerDocument: mockDoc });

  vi.stubGlobal('document', mockDoc);
  vi.stubGlobal('window', mockWin);

  const container = new MockElement('DIV', mockDoc);
  return { mockDoc, mockWin, container };
}

describe('ScoreViewer Component (J7)', () => {
  const originalOpen = typeof window !== 'undefined' ? window.open : undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    lastMockViewer = null;
    lastEventBus = null;
    pdfjsLibAtViewerInit = null;
    delete (globalThis as { pdfjsLib?: unknown }).pdfjsLib;
    if (typeof window !== 'undefined') {
      window.open = vi.fn();
    }
  });

  afterEach(() => {
    if (typeof window !== 'undefined' && originalOpen) {
      window.open = originalOpen;
    }
  });

  const samplePieceWithStorage: PracticePiece = {
    id: 'piece_storage_1',
    title: '테스트 합창곡',
    composer: '작곡가',
    arranger: '편곡자',
    scoreUrl: 'https://external-drive.com/score.pdf',
    scoreStorageKey: 'scores/piece_storage_1.pdf',
    isArchived: false,
    createdAt: '2026-11-20T00:00:00Z',
    updatedAt: '2026-11-20T00:00:00Z',
  };

  const samplePieceExternalOnly: PracticePiece = {
    id: 'piece_external_only',
    title: '외부 구글 드라이브 곡',
    composer: '작곡가',
    arranger: '편곡자',
    scoreUrl: 'https://drive.google.com/file/d/123/view',
    isArchived: false,
    createdAt: '2026-11-20T00:00:00Z',
    updatedAt: '2026-11-20T00:00:00Z',
  };

  const dummyConfig: AppConfig = {
    rehearsalDay: '목요일',
    startTime: '19:30',
    lateGraceMinutes: 10,
    defaultLat: 37.5665,
    defaultLon: 126.978,
    defaultRadius: 100,
    adminPin: '1234',
    mediaPublicBaseUrl: 'https://media.test.workers.dev',
    practiceTrackKinds: ['가이드', '반주'],
    performanceCategories: ['연주'],
  };

  it('renders score viewer overlay with title, close button, and zoom buttons when scoreStorageKey exists', () => {
    vi.spyOn(sheetsService, 'getPracticeCatalog').mockReturnValue({
      pieces: [samplePieceWithStorage],
      tracks: [],
      programPieces: [],
      performances: [],
      performancePieces: [],
    });
    vi.spyOn(sheetsService, 'getConfig').mockReturnValue(dummyConfig);

    const html = renderToString(
      <ScoreViewer pieceId={samplePieceWithStorage.id} onClose={vi.fn()} />
    );

    expect(html).toContain('score-viewer-overlay');
    expect(html).toContain('테스트 합창곡');
    expect(html).toContain('aria-label="닫기"');
    expect(html).toContain('aria-label="축소"');
    expect(html).toContain('aria-label="확대"');
    expect(html).toContain('악보를 불러오는 중...');
  });

  it('shows failure state "악보를 열 수 없어요" and "새 탭에서 열기" button when only external scoreUrl exists', () => {
    vi.spyOn(sheetsService, 'getPracticeCatalog').mockReturnValue({
      pieces: [samplePieceExternalOnly],
      tracks: [],
      programPieces: [],
      performances: [],
      performancePieces: [],
    });
    vi.spyOn(sheetsService, 'getConfig').mockReturnValue(dummyConfig);

    const html = renderToString(
      <ScoreViewer pieceId={samplePieceExternalOnly.id} onClose={vi.fn()} />
    );

    expect(html).toContain('악보를 열 수 없어요');
    expect(html).toContain('새 탭에서 열기');
  });

  it('shows failure state when piece is not found in catalog', () => {
    vi.spyOn(sheetsService, 'getPracticeCatalog').mockReturnValue({
      pieces: [],
      tracks: [],
      programPieces: [],
      performances: [],
      performancePieces: [],
    });
    vi.spyOn(sheetsService, 'getConfig').mockReturnValue(dummyConfig);

    const html = renderToString(
      <ScoreViewer pieceId="non_existent" onClose={vi.fn()} />
    );

    expect(html).toContain('악보를 열 수 없어요');
  });

  it('renders mini player spacer only when currentTrack is active in player context', () => {
    vi.spyOn(sheetsService, 'getPracticeCatalog').mockReturnValue({
      pieces: [samplePieceWithStorage],
      tracks: [],
      programPieces: [],
      performances: [],
      performancePieces: [],
    });
    vi.spyOn(sheetsService, 'getConfig').mockReturnValue(dummyConfig);

    const mockTrackItem: PlayableTrackItem = {
      track: {
        id: 'track_1',
        pieceId: samplePieceWithStorage.id,
        kind: '가이드',
        label: '소프라노',
        source: 'r2',
        orderIndex: 0,
        storageKey: 'audio/track_1.m4a',
        url: '',
        durationSeconds: 120,
        sizeBytes: 1024,
        isArchived: false,
        createdAt: '2026-11-20T00:00:00Z',
        updatedAt: '2026-11-20T00:00:00Z',
      },
      pieceTitle: samplePieceWithStorage.title,
      playbackUrl: 'https://media.test.workers.dev/audio/track_1.m4a',
    };

    const createMockCtx = (track: PlayableTrackItem | null): AudioPlayerContextValue => ({
      currentTrack: track,
      queue: track ? [track] : [],
      currentIndex: track ? 0 : -1,
      queueSource: null,
      isPlaying: Boolean(track),
      isBlocked: false,
      playbackSpeed: 1.0,
      repeatMode: 'off',
      playTrack: vi.fn(),
      playQueue: vi.fn(),
      playQueueIndex: vi.fn(),
      togglePlay: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      seekTo: vi.fn(),
      seekRelative: vi.fn(),
      setSpeed: vi.fn(),
      cycleSpeed: vi.fn(),
      cycleRepeat: vi.fn(),
      previousTrack: vi.fn(),
      nextTrack: vi.fn(),
      closePlayer: vi.fn(),
      audioElementRef: { current: null },
    });

    const noTrackHtml = renderToString(
      <AudioPlayerContext.Provider value={createMockCtx(null)}>
        <ScoreViewer pieceId={samplePieceWithStorage.id} onClose={vi.fn()} />
      </AudioPlayerContext.Provider>
    );
    expect(noTrackHtml).not.toContain('score-viewer-mini-spacer');

    const hasTrackHtml = renderToString(
      <AudioPlayerContext.Provider value={createMockCtx(mockTrackItem)}>
        <ScoreViewer pieceId={samplePieceWithStorage.id} onClose={vi.fn()} />
      </AudioPlayerContext.Provider>
    );
    expect(hasTrackHtml).toContain('score-viewer-mini-spacer');
  });

  it('mounts PDFViewer, sets document, applies page-width on pagesinit, and cleans up on unmount', async () => {
    vi.spyOn(sheetsService, 'getPracticeCatalog').mockReturnValue({
      pieces: [samplePieceWithStorage],
      tracks: [],
      programPieces: [],
      performances: [],
      performancePieces: [],
    });
    vi.spyOn(sheetsService, 'getConfig').mockReturnValue(dummyConfig);

    const { container } = setupMockDom();
    const root = createRoot(container as unknown as Element);

    await act(async () => {
      root.render(<ScoreViewer pieceId={samplePieceWithStorage.id} onClose={vi.fn()} />);
    });

    // Wait for async pdfjs loading
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(lastMockViewer).not.toBeNull();
    expect(lastMockViewer?.setDocument).toHaveBeenCalled();

    // Trigger pagesinit on eventBus
    act(() => {
      lastEventBus?.emit('pagesinit');
    });
    expect(lastMockViewer?.currentScaleValue).toBe('page-width');

    // Unmount and verify cleanup sequence
    await act(async () => {
      root.unmount();
    });

    expect(lastMockViewer?.setDocument).toHaveBeenCalledWith(null);
    expect(mockDocCleanup).toHaveBeenCalled();
    expect(mockTaskDestroy).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('뷰어 모듈을 불러오기 전에 globalThis.pdfjsLib이 설정돼 있다', async () => {
    vi.spyOn(sheetsService, 'getPracticeCatalog').mockReturnValue({
      pieces: [samplePieceWithStorage],
      tracks: [],
      programPieces: [],
      performances: [],
      performancePieces: [],
    });
    vi.spyOn(sheetsService, 'getConfig').mockReturnValue(dummyConfig);

    const { container } = setupMockDom();
    const root = createRoot(container as unknown as Element);

    await act(async () => {
      root.render(<ScoreViewer pieceId={samplePieceWithStorage.id} onClose={vi.fn()} />);
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(pdfjsLibAtViewerInit).toBeDefined();
    expect((globalThis as { pdfjsLib?: unknown }).pdfjsLib).toBeDefined();
    expect(lastMockViewer).not.toBeNull();

    await act(async () => {
      root.unmount();
    });

    vi.unstubAllGlobals();
  });

  it('contains zero emojis in UI strings (R16 pure Korean discipline)', () => {
    vi.spyOn(sheetsService, 'getPracticeCatalog').mockReturnValue({
      pieces: [samplePieceWithStorage],
      tracks: [],
      programPieces: [],
      performances: [],
      performancePieces: [],
    });
    vi.spyOn(sheetsService, 'getConfig').mockReturnValue(dummyConfig);

    const html = renderToString(
      <ScoreViewer pieceId={samplePieceWithStorage.id} onClose={vi.fn()} />
    );

    const emojiRegex = /\p{Extended_Pictographic}/u;
    expect(emojiRegex.test(html)).toBe(false);
  });
});
