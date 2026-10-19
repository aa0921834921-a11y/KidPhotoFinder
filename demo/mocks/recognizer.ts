export const W600K_MB = 174;
export function modelReady() { return true; }
export async function downloadModel(p?: (x: number) => void) { p?.(1); }
export const engineReady = () => true;
export async function warmUp() {}
