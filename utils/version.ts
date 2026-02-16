/**
 * Generate version number based on date + index
 * Format: YYYY.MM.DD.INDEX
 * The index is based on hours to allow multiple builds per day
 */
export function getAppVersion(): string {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  // Use hours/minutes as a simple index for builds on the same day
  // This gives us up to 1440 possible versions per day
  const index = now.getHours() * 60 + now.getMinutes();

  return `${year}.${month}.${day}.${Math.floor(index / 10) + 1}`;
}

/**
 * Get the version for display (shorter format)
 */
export function getDisplayVersion(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(Math.floor(now.getMinutes() / 10) * 10).padStart(2, '0');

  return `${year}.${month}.${day}.${hour}${minute}`;
}
