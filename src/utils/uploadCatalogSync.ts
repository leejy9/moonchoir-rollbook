export interface UploadQueueLike {
  getSnapshot: () => { completedJobs: Array<{ id: string; status: string }> };
  subscribe: (listener: () => void) => () => void;
}

export function setupUploadCatalogSync(
  queue: UploadQueueLike,
  reloadCatalog: () => void | Promise<void>,
  debounceMs = 300
): () => void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const knownDoneIds = new Set(
    queue.getSnapshot().completedJobs.filter((j) => j.status === 'done').map((j) => j.id)
  );

  const unsubscribe = queue.subscribe(() => {
    const snapshot = queue.getSnapshot();
    const doneJobs = snapshot.completedJobs.filter((j) => j.status === 'done');
    let hasNewDone = false;
    for (const job of doneJobs) {
      if (!knownDoneIds.has(job.id)) {
        knownDoneIds.add(job.id);
        hasNewDone = true;
      }
    }

    if (hasNewDone) {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void reloadCatalog();
      }, debounceMs);
    }
  });

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    unsubscribe();
  };
}
