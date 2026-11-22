export interface RenderTaskLike {
  promise: Promise<void>;
  cancel: () => void;
}

function isCancelledError(err: unknown): boolean {
  return Boolean(
    err &&
    typeof err === 'object' &&
    ((err as { name?: string }).name === 'RenderingCancelledException' ||
      (err as { message?: string }).message?.includes('Rendering cancelled'))
  );
}

/**
 * ScoreRenderCoordinator (J5):
 * 1. 쪽 번호별로 진행 중인 RenderTask를 관리하고, 새 렌더 요청 시 이전 작업의 cancel()을 부르고 완료를 대기한다.
 * 2. 쪽마다 마지막으로 그린 배율을 기억하여 동일 배율 재호출 시 렌더를 생략한다.
 * 3. cancelAll()로 언마운트나 소스 변경 시 모든 작업을 안전하게 취소한다.
 */
export class ScoreRenderCoordinator {
  private activeTasks = new Map<number, RenderTaskLike>();
  private renderedScales = new Map<number, number>();

  async requestRender(
    pageNumber: number,
    scale: number,
    renderFn: () => RenderTaskLike
  ): Promise<boolean> {
    // 1. 동일 배율 재호출 방지
    if (this.renderedScales.get(pageNumber) === scale) {
      return false;
    }

    // 2. 이전 렌더 작업 취소 및 정착(settlement) 대기
    const prevTask = this.activeTasks.get(pageNumber);
    if (prevTask) {
      prevTask.cancel();
      try {
        await prevTask.promise;
      } catch (err: unknown) {
        if (!isCancelledError(err)) {
          console.warn(`[ScoreRenderCoordinator] 이전 렌더 작업 취소 대기 중 오류 (page ${pageNumber}):`, err);
        }
      }
      this.activeTasks.delete(pageNumber);
    }

    // 3. 새 렌더 작업 시작
    const task = renderFn();
    this.activeTasks.set(pageNumber, task);

    try {
      await task.promise;
      this.renderedScales.set(pageNumber, scale);
      return true;
    } catch (err: unknown) {
      if (isCancelledError(err)) {
        return false;
      }
      throw err;
    } finally {
      if (this.activeTasks.get(pageNumber) === task) {
        this.activeTasks.delete(pageNumber);
      }
    }
  }

  cancelAll(): void {
    this.activeTasks.forEach((task) => {
      try {
        task.cancel();
      } catch {
        // 무시
      }
    });
    this.activeTasks.clear();
    this.renderedScales.clear();
  }

  getActiveTask(pageNumber: number): RenderTaskLike | undefined {
    return this.activeTasks.get(pageNumber);
  }

  getRenderedScale(pageNumber: number): number | undefined {
    return this.renderedScales.get(pageNumber);
  }
}
