import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { uploadQueue } from './uploadQueue';
import * as workerClient from './workerClient';

describe('uploadQueue', () => {
  let fakeWindow: any;

  beforeEach(() => {
    fakeWindow = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('window', fakeWindow);
    uploadQueue.resetForTest();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    uploadQueue.resetForTest();
    vi.unstubAllGlobals();
  });

  it('progresses through queued -> uploading -> saving -> done on success', async () => {
    vi.spyOn(workerClient, 'uploadFile').mockResolvedValue({
      key: '2026/audio/test.m4a',
      size: 1024,
    });

    const states: string[] = [];
    const unsubscribe = uploadQueue.subscribe(() => {
      const snap = uploadQueue.getSnapshot();
      if (snap.activeJob) {
        states.push(snap.activeJob.status);
      }
    });

    const saveSpy = vi.fn().mockResolvedValue(undefined);
    const blob = new Blob(['1234'], { type: 'audio/mp4' });

    uploadQueue.enqueue({
      pieceId: 'p1',
      kind: 'audio',
      title: '트랙1',
      fileName: 'test.m4a',
      file: blob,
      baseUrl: 'https://media.worker.dev',
      saveFn: saveSpy,
    });

    await vi.waitFor(() => {
      const snap = uploadQueue.getSnapshot();
      expect(snap.completedJobs.length).toBe(1);
    });

    unsubscribe();
    const snap = uploadQueue.getSnapshot();
    expect(snap.completedJobs[0].status).toBe('done');
    expect(snap.completedJobs[0].newStorageKey).toBe('2026/audio/test.m4a');
    expect(saveSpy).toHaveBeenCalledWith('2026/audio/test.m4a', 1024);
    expect(states).toContain('uploading');
    expect(states).toContain('saving');
  });

  it('deletes newly uploaded key when saveFn fails', async () => {
    vi.spyOn(workerClient, 'uploadFile').mockResolvedValue({
      key: '2026/audio/new.m4a',
      size: 1024,
    });
    const deleteSpy = vi.spyOn(workerClient, 'deleteObject').mockResolvedValue(undefined);

    const saveSpy = vi.fn().mockRejectedValue(new Error('DB Save Failed'));
    const blob = new Blob(['1234'], { type: 'audio/mp4' });

    uploadQueue.enqueue({
      pieceId: 'p1',
      kind: 'audio',
      title: '트랙1',
      fileName: 'test.m4a',
      file: blob,
      baseUrl: 'https://media.worker.dev',
      saveFn: saveSpy,
    });

    await vi.waitFor(() => {
      const snap = uploadQueue.getSnapshot();
      expect(snap.completedJobs.length).toBe(1);
    });

    const snap = uploadQueue.getSnapshot();
    expect(snap.completedJobs[0].status).toBe('failed');
    expect(snap.completedJobs[0].error).toContain('DB Save Failed');
    expect(deleteSpy).toHaveBeenCalledWith('2026/audio/new.m4a', 'https://media.worker.dev');
  });

  it('deletes previousStorageKey only after saveFn succeeds when replacing', async () => {
    vi.spyOn(workerClient, 'uploadFile').mockResolvedValue({
      key: '2026/audio/new.m4a',
      size: 1024,
    });
    const deleteSpy = vi.spyOn(workerClient, 'deleteObject').mockResolvedValue(undefined);

    const callOrder: string[] = [];
    const saveSpy = vi.fn().mockImplementation(async () => {
      callOrder.push('save');
    });
    deleteSpy.mockImplementation(async () => {
      callOrder.push('deletePrevious');
    });

    const blob = new Blob(['1234'], { type: 'audio/mp4' });

    uploadQueue.enqueue({
      pieceId: 'p1',
      kind: 'audio',
      title: '트랙1',
      fileName: 'test.m4a',
      file: blob,
      previousStorageKey: '2025/audio/old.m4a',
      baseUrl: 'https://media.worker.dev',
      saveFn: saveSpy,
    });

    await vi.waitFor(() => {
      const snap = uploadQueue.getSnapshot();
      expect(snap.completedJobs.length).toBe(1);
    });

    expect(callOrder).toEqual(['save', 'deletePrevious']);
    expect(deleteSpy).toHaveBeenCalledWith('2025/audio/old.m4a', 'https://media.worker.dev');
  });

  it('registers beforeunload while jobs are active and removes it when done', async () => {
    vi.spyOn(workerClient, 'uploadFile').mockResolvedValue({
      key: '2026/audio/test.m4a',
      size: 1024,
    });

    const blob = new Blob(['1234'], { type: 'audio/mp4' });

    uploadQueue.enqueue({
      pieceId: 'p1',
      kind: 'audio',
      title: '트랙1',
      fileName: 'test.m4a',
      file: blob,
      baseUrl: 'https://media.worker.dev',
      saveFn: vi.fn().mockResolvedValue(undefined),
    });

    expect(fakeWindow.addEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));

    await vi.waitFor(() => {
      const snap = uploadQueue.getSnapshot();
      expect(snap.completedJobs.length).toBe(1);
    });

    expect(fakeWindow.removeEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });

  it('records failed jobs, supports retrying with same file, and dismisses failed job', async () => {
    vi.spyOn(workerClient, 'uploadFile').mockRejectedValueOnce(new Error('Network error'));

    const dummyFile = new File(['audio data'], 'fail.m4a', { type: 'audio/mp4' });
    uploadQueue.enqueue({
      pieceId: 'p1',
      kind: 'audio',
      title: '실패 트랙',
      fileName: 'fail.m4a',
      file: dummyFile,
      baseUrl: 'https://media.worker.dev',
      saveFn: vi.fn(),
    });

    await vi.waitFor(() => {
      const snap = uploadQueue.getSnapshot();
      expect(snap.failedCount).toBe(1);
      expect(snap.failedJobs.length).toBe(1);
    });

    const failedJob = uploadQueue.getSnapshot().failedJobs[0];
    expect(failedJob.error).toBe('Network error');

    // Retry job
    vi.spyOn(workerClient, 'uploadFile').mockResolvedValueOnce({ key: 'key_ok', size: 100 });
    uploadQueue.retryJob(failedJob.id);

    await vi.waitFor(() => {
      const snap = uploadQueue.getSnapshot();
      expect(snap.failedCount).toBe(0);
      expect(snap.completedJobs[0].status).toBe('done');
    });

    // Dismiss job
    uploadQueue.dismissJob(failedJob.id);
    expect(uploadQueue.getSnapshot().completedJobs).toHaveLength(0);
  });
});
