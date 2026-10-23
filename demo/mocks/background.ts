export const DAILY_TASK = 'x';
export async function syncSchedule() {}
export async function backgroundAvailable() { return true; }
export async function setupNotifications() {}
export async function askNotificationPermission() { return true; }
export const staleAfterMin = (every: number) => every * 2 + 30;
export async function healSchedule() { return false; }
