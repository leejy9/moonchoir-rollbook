import { useState, useEffect } from 'react';
import { readPreference, writePreference, PREFERENCE_KEYS } from '../sheetsStorage';
import { uploadFile, deleteObject } from './workerClient';
import { canCompress, compressAudio, validateAudioFile, COMPRESSION_ERROR_MESSAGE } from './audioCompress';

export type UploadJobStatus =
  | 'queued'
  | 'compressing'
  | 'uploading'
  | 'saving'
  | 'done'
  | 'failed';

export interface UploadJobRequest {
  pieceId: string;
  kind: 'audio' | 'score';
  title: string;
  trackKind?: string;
  fileName: string;
  file: Blob | File;
  previousStorageKey?: string;
  baseUrl: string;
  saveFn: (newKey: string, size: number, durationSeconds?: number) => Promise<void>;
}

export interface UploadJob extends UploadJobRequest {
  id: string;
  status: UploadJobStatus;
  progress: number;
  newStorageKey?: string;
  error?: string;
  createdAt: number;
}

export interface PersistedJobMeta {
  id: string;
  pieceId: string;
  kind: 'audio' | 'score';
  title: string;
  trackKind?: string;
  fileName: string;
  status: UploadJobStatus;
  createdAt: number;
}

type Listener = () => void;

class UploadQueueManager {
  private queue: UploadJob[] = [];
  private activeJob: UploadJob | null = null;
  private completedJobs: UploadJob[] = [];
  private haltedJobs: PersistedJobMeta[] = [];
  private listeners = new Set<Listener>();
  private beforeUnloadBound = false;

  constructor() {
    this.loadHaltedJobs();
  }

  private loadHaltedJobs(): void {
    const saved = readPreference<PersistedJobMeta[]>(
      PREFERENCE_KEYS.UPLOAD_JOBS,
      (val): val is PersistedJobMeta[] => Array.isArray(val),
      []
    );
    // 이전에 완료되지 못한 작업들을 멈춘 업로드로 복원
    this.haltedJobs = saved.filter(
      (job) => job.status === 'queued' || job.status === 'compressing' || job.status === 'uploading' || job.status === 'saving'
    );
  }

  private persistActiveMeta(): void {
    const list: PersistedJobMeta[] = [];
    if (this.activeJob) {
      list.push({
        id: this.activeJob.id,
        pieceId: this.activeJob.pieceId,
        kind: this.activeJob.kind,
        title: this.activeJob.title,
        trackKind: this.activeJob.trackKind,
        fileName: this.activeJob.fileName,
        status: this.activeJob.status,
        createdAt: this.activeJob.createdAt,
      });
    }
    for (const j of this.queue) {
      list.push({
        id: j.id,
        pieceId: j.pieceId,
        kind: j.kind,
        title: j.title,
        trackKind: j.trackKind,
        fileName: j.fileName,
        status: j.status,
        createdAt: j.createdAt,
      });
    }
    writePreference(PREFERENCE_KEYS.UPLOAD_JOBS, list);
    this.updateBeforeUnload();
  }

  private handleBeforeUnload = (e: BeforeUnloadEvent): string => {
    e.preventDefault();
    e.returnValue = '업로드가 진행 중입니다. 페이지를 벗어나면 중단됩니다.';
    return e.returnValue;
  };

  private updateBeforeUnload(): void {
    if (typeof window === 'undefined') return;
    const hasActive = Boolean(this.activeJob) || this.queue.length > 0;
    if (hasActive && !this.beforeUnloadBound) {
      window.addEventListener('beforeunload', this.handleBeforeUnload);
      this.beforeUnloadBound = true;
    } else if (!hasActive && this.beforeUnloadBound) {
      window.removeEventListener('beforeunload', this.handleBeforeUnload);
      this.beforeUnloadBound = false;
    }
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }

  public getSnapshot() {
    const failedJobs = this.completedJobs.filter((j) => j.status === 'failed');
    return {
      activeJob: this.activeJob,
      queuedJobs: [...this.queue],
      completedJobs: [...this.completedJobs],
      failedJobs,
      haltedJobs: [...this.haltedJobs],
      activeCount: (this.activeJob ? 1 : 0) + this.queue.length,
      failedCount: failedJobs.length,
    };
  }

  public retryJob(id: string): void {
    const idx = this.completedJobs.findIndex((j) => j.id === id);
    if (idx === -1) return;
    const job = this.completedJobs[idx];
    if (!job.file) return;

    this.completedJobs.splice(idx, 1);
    job.status = 'queued';
    job.progress = 0;
    job.error = undefined;
    this.queue.push(job);
    this.persistActiveMeta();
    this.notify();
    void this.processNext();
  }

  public dismissJob(id: string): void {
    this.completedJobs = this.completedJobs.filter((j) => j.id !== id);
    this.haltedJobs = this.haltedJobs.filter((j) => j.id !== id);
    this.persistActiveMeta();
    this.notify();
  }

  public dismissHaltedJob(id: string): void {
    this.haltedJobs = this.haltedJobs.filter((j) => j.id !== id);
    this.persistActiveMeta();
    this.notify();
  }

  public enqueue(req: UploadJobRequest): string {
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const job: UploadJob = {
      ...req,
      id,
      status: 'queued',
      progress: 0,
      createdAt: Date.now(),
    };
    this.queue.push(job);
    this.persistActiveMeta();
    this.notify();
    void this.processNext();
    return id;
  }

  private async processNext(): Promise<void> {
    if (this.activeJob || this.queue.length === 0) return;

    const job = this.queue.shift()!;
    this.activeJob = job;
    this.persistActiveMeta();
    this.notify();

    try {
      // 1. 음원 압축 검증 분기
      let uploadBlob: Blob = job.file;
      let durationSeconds: number | undefined;

      if (job.kind === 'audio') {
        const canComp = await canCompress();
        if (canComp) {
          job.status = 'compressing';
          job.progress = 0;
          this.notify();
          const compResult = await compressAudio(job.file, (percent) => {
            job.progress = percent;
            this.notify();
          });
          uploadBlob = compResult.file;
          if (compResult.durationSeconds) {
            durationSeconds = compResult.durationSeconds;
          }
        } else {
          const val = validateAudioFile({
            name: job.fileName,
            size: job.file.size,
            type: job.file.type,
          });
          if (!val.ok) {
            throw new Error(val.reason || COMPRESSION_ERROR_MESSAGE);
          }
        }
      }

      // 2. Worker 업로드
      job.status = 'uploading';
      job.progress = 0;
      this.notify();

      const uploadRes = await uploadFile(
        job.kind,
        uploadBlob,
        (percent) => {
          job.progress = percent;
          this.notify();
        },
        job.baseUrl
      );

      job.newStorageKey = uploadRes.key;

      // 3. RPC로 트랙 / 악보 메타데이터 저장
      job.status = 'saving';
      job.progress = 100;
      this.notify();

      let inSaveStep = false;
      try {
        inSaveStep = true;
        if (durationSeconds !== undefined) {
          await job.saveFn(uploadRes.key, uploadRes.size, durationSeconds);
        } else {
          await job.saveFn(uploadRes.key, uploadRes.size);
        }
        inSaveStep = false;
      } catch (saveErr) {
        // 저장이 실패하면 새로 올린 R2 키를 DELETE하여 고아 객체 방지
        try {
          await deleteObject(uploadRes.key, job.baseUrl);
        } catch (delErr) {
          console.warn('[UploadQueue] Failed to cleanup new storage key on save failure:', delErr);
        }
        throw saveErr;
      }

      // 4. 교체 작업인 경우, 저장 성공 후에만 이전 R2 키 DELETE
      if (job.previousStorageKey) {
        try {
          await deleteObject(job.previousStorageKey, job.baseUrl);
        } catch (delPrevErr) {
          console.warn('[UploadQueue] Failed to delete previous storage key after replacement:', delPrevErr);
        }
      }

      job.status = 'done';
    } catch (err: unknown) {
      job.status = 'failed';
      job.error = err instanceof Error ? err.message : String(err);

      let status: number | string = 'unknown';
      if (err && typeof err === 'object' && 'status' in err && typeof (err as { status: unknown }).status === 'number') {
        status = (err as { status: number }).status;
      } else {
        const match = job.error.match(/Upload failed \((\d+)\)/);
        if (match) {
          status = Number(match[1]);
        } else if (job.status === 'saving') {
          status = 'save';
        }
      }
      console.warn('[uploadQueue] failed', {
        kind: job.kind,
        fileName: job.fileName,
        status,
        message: job.error,
      });
    } finally {
      this.completedJobs.unshift(job);
      if (this.completedJobs.length > 20) {
        this.completedJobs.pop();
      }
      this.activeJob = null;
      this.persistActiveMeta();
      this.notify();
      void this.processNext();
    }
  }

  /** 테스트 환경을 위한 초기화 메서드 */
  public resetForTest(): void {
    this.queue = [];
    this.activeJob = null;
    this.completedJobs = [];
    this.haltedJobs = [];
    this.updateBeforeUnload();
    this.notify();
  }
}

export const uploadQueue = new UploadQueueManager();

export function useUploadQueue() {
  const [snapshot, setSnapshot] = useState(() => uploadQueue.getSnapshot());

  useEffect(() => {
    return uploadQueue.subscribe(() => {
      setSnapshot(uploadQueue.getSnapshot());
    });
  }, []);

  return {
    ...snapshot,
    dismissHaltedJob: (id: string) => uploadQueue.dismissHaltedJob(id),
    retryJob: (id: string) => uploadQueue.retryJob(id),
    dismissJob: (id: string) => uploadQueue.dismissJob(id),
  };
}
