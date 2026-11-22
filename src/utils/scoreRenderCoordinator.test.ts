import { describe, expect, it, vi } from 'vitest';
import { ScoreRenderCoordinator, type RenderTaskLike } from './scoreRenderCoordinator';

describe('ScoreRenderCoordinator (J5)', () => {
  it('같은 쪽 renderPage를 연달아 두 번 부르면 첫 작업의 cancel이 불리고, 두 번째 렌더는 첫 번째가 끝난 뒤 시작된다', async () => {
    const coordinator = new ScoreRenderCoordinator();

    let task1Resolve!: () => void;
    const task1Promise = new Promise<void>((resolve) => {
      task1Resolve = resolve;
    });

    const task1Cancel = vi.fn(() => {
      const err = new Error('Rendering cancelled');
      err.name = 'RenderingCancelledException';
      task1Resolve(); // settled
    });

    const task1: RenderTaskLike = {
      promise: task1Promise,
      cancel: task1Cancel,
    };

    let task2Started = false;
    const task2: RenderTaskLike = {
      promise: Promise.resolve(),
      cancel: vi.fn(),
    };

    // First render starts
    const render1Promise = coordinator.requestRender(1, 1.0, () => task1);

    // Second render called immediately while first is in-flight
    const render2Promise = coordinator.requestRender(1, 1.5, () => {
      task2Started = true;
      expect(task1Cancel).toHaveBeenCalled();
      return task2;
    });

    expect(task1Cancel).toHaveBeenCalledTimes(1);
    await Promise.all([render1Promise, render2Promise]);
    expect(task2Started).toBe(true);
  });

  it('같은 배율 재호출 시 렌더 생략', async () => {
    const coordinator = new ScoreRenderCoordinator();
    const renderFn = vi.fn().mockReturnValue({
      promise: Promise.resolve(),
      cancel: vi.fn(),
    });

    // First render at 1.0
    const renderedFirst = await coordinator.requestRender(1, 1.0, renderFn);
    expect(renderedFirst).toBe(true);
    expect(renderFn).toHaveBeenCalledTimes(1);

    // Second render at same 1.0
    const renderedSecond = await coordinator.requestRender(1, 1.0, renderFn);
    expect(renderedSecond).toBe(false);
    expect(renderFn).toHaveBeenCalledTimes(1); // not called again
  });

  it('언마운트 시 모든 작업 취소', () => {
    const coordinator = new ScoreRenderCoordinator();
    const cancel1 = vi.fn();
    const cancel2 = vi.fn();

    void coordinator.requestRender(1, 1.0, () => ({
      promise: new Promise(() => {}),
      cancel: cancel1,
    }));
    void coordinator.requestRender(2, 1.0, () => ({
      promise: new Promise(() => {}),
      cancel: cancel2,
    }));

    coordinator.cancelAll();

    expect(cancel1).toHaveBeenCalledTimes(1);
    expect(cancel2).toHaveBeenCalledTimes(1);
    expect(coordinator.getActiveTask(1)).toBeUndefined();
    expect(coordinator.getActiveTask(2)).toBeUndefined();
  });
});
