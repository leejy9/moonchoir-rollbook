/**
 * Storage usage formatting helper compliant with V23 & L1.
 */

const ONE_MB = 1024 * 1024;
const ONE_GB = 1024 * 1024 * 1024;

/**
 * Formats byte count into storage usage string.
 * - Under 1GB: MB with 1 decimal place (0 < bytes < 0.1MB formatted as ceiling 0.1MB)
 * - 1GB or above: GB with 2 decimal places
 * - 0 or invalid: '0MB'
 */
export function formatStorageUsage(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0MB';
  }

  if (bytes < ONE_GB) {
    const mb = bytes / ONE_MB;
    if (mb < 0.1) {
      return '0.1MB';
    }
    return `${mb.toFixed(1)}MB`;
  }

  const gb = bytes / ONE_GB;
  return `${gb.toFixed(2)}GB`;
}
