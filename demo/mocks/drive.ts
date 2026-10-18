const BASE = process.env.EXPO_PUBLIC_BASE_URL || '';
export type Account = { email: string; name: string | null; photo: string | null };
export type FolderChoice = { id: string; name: string; where: string };
export class NeedSignIn extends Error {}
const acct: Account = { email: 'parent@gmail.com', name: '家長', photo: null };
export async function signIn() { return acct; }
export async function restore() { return acct; }
export async function signOut() {}
export async function candidateFolders(): Promise<FolderChoice[]> {
  return [{ id: '1', name: '115-1 健康班', where: '與我共用' }, { id: '2', name: '115-1 健康班 活動影片', where: '與我共用' }, { id: '3', name: '家庭照片', where: '我的雲端硬碟' }];
}
export function previewUri(id: string): Promise<string> {
  if (id.startsWith('local:')) return Promise.resolve(`${BASE}/demo/${id.slice(6).split('_')[0]}.jpg`); return Promise.resolve(`${BASE}/demo/${id.startsWith('face_') ? id.slice(5) : id}.jpg`); }
export function clearScanCache() {}
