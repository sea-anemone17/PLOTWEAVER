import { useState } from 'react';
import { makeBackup, restoreBackup, type Project } from './data';
import { Button } from './UI';

const CLIENT_ID = '1093927325707-jnh116ck5sr0selafcmkabvh8acltrhf.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const API = 'https://www.googleapis.com/drive/v3/files';
type TokenResponse = { access_token?: string; error?: string; error_description?: string };
type TokenClient = { requestAccessToken: (options?: { prompt?: string }) => void };
type GoogleIdentity = { accounts: { oauth2: { initTokenClient: (config: { client_id: string; scope: string; callback: (response: TokenResponse) => void }) => TokenClient } } };
declare global { interface Window { google?: GoogleIdentity } }

let scriptPromise: Promise<void> | undefined;
function loadGoogle(): Promise<void> {
 if (window.google?.accounts.oauth2) return Promise.resolve();
 if (!scriptPromise) scriptPromise = new Promise((resolve, reject) => {
  const script = document.createElement('script');
  script.src = 'https://accounts.google.com/gsi/client';
  script.async = true;
  script.onload = () => window.google?.accounts.oauth2 ? resolve() : reject(new Error('Google 로그인 라이브러리를 불러오지 못했습니다.'));
  script.onerror = () => reject(new Error('Google 로그인 스크립트 로드 실패'));
  document.head.appendChild(script);
 }).catch(error => { scriptPromise = undefined; throw error; });
 return scriptPromise;
}
function requestToken(): Promise<string> {
 return new Promise((resolve, reject) => {
  if (!window.google?.accounts.oauth2) { reject(new Error('Google 로그인 라이브러리가 준비되지 않았습니다.')); return; }
  const client = window.google.accounts.oauth2.initTokenClient({
   client_id: CLIENT_ID, scope: SCOPE,
   callback: response => response.access_token ? resolve(response.access_token) : reject(new Error(response.error_description || response.error || 'Google 인증 실패'))
  });
  client.requestAccessToken({ prompt: 'consent' });
 });
}
async function apiFetch(token: string, url: string, init: RequestInit = {}) {
 const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
 if (!response.ok) {
  let detail = '';
  try { const body = await response.json(); detail = body.error?.message || ''; } catch { /* no JSON body */ }
  throw new Error(`Google Drive 오류 (${response.status})${detail ? ': ' + detail : ''}`);
 }
 return response;
}
type DriveFile = { id: string; name: string; modifiedTime?: string };
const fileName = (id: string) => `plotweaver-${id}.json`;
async function findBackup(token: string, projectId: string): Promise<DriveFile | undefined> {
 const q = encodeURIComponent(`name = '${fileName(projectId)}' and trashed = false`);
 const response = await apiFetch(token, `${API}?spaces=appDataFolder&q=${q}&fields=nextPageToken,files(id,name,modifiedTime)&page_size=100`);
 const data = await response.json() as { files?: DriveFile[] };
 return data.files?.sort((a,b) => (b.modifiedTime || '').localeCompare(a.modifiedTime || ''))[0];
}
async function uploadBackup(token: string, project: Project): Promise<void> {
 const backup = JSON.stringify(await makeBackup(project.id));
 const existing = await findBackup(token, project.id);
 const metadata = existing ? { name: fileName(project.id) } : { name: fileName(project.id), parents: ['appDataFolder'] };
 const boundary = 'plotweaver_' + crypto.randomUUID().replace(/-/g, '');
 const multipart = [
  `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
  `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${backup}\r\n`,
  `--${boundary}--`
 ].join('');
 await apiFetch(token, existing ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existing.id)}?uploadType=multipart` : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
  method: existing ? 'PATCH' : 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart
 });
}
async function downloadFromDrive(token: string, projectId: string): Promise<Project> {
 const file = await findBackup(token, projectId);
 if (!file) throw new Error('이 프로젝트의 Drive 백업이 없습니다. 먼저 Drive에 저장해 주세요.');
 const response = await apiFetch(token, `${API}/${encodeURIComponent(file.id)}?alt=media`);
 return restoreBackup(await response.text());
}
export default function DriveBackup({ project, onRestore }: { project: Project; onRestore: (id: string) => void }) {
 const [token, setToken] = useState<string | null>(null);
 const [busy, setBusy] = useState(false);
 const [message, setMessage] = useState('');
 async function run(action: (accessToken: string) => Promise<void>) {
  setBusy(true); setMessage('');
  try {
   await loadGoogle();
   // Tokens are kept in memory only; a fresh token is requested for each operation.
   const accessToken = await requestToken();
   setToken(accessToken);
   await action(accessToken);
  } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  finally { setBusy(false); }
 }
 return <section className="settings-panel">
  <h2>Google Drive 백업</h2>
  <p className="muted">Google Drive의 앱 전용 비공개 저장공간에 프로젝트 JSON을 저장합니다. 다른 기기에서 복원하면 기존 원고를 덮어쓰지 않고 별도의 프로젝트가 만들어집니다.</p>
  <div className="settings-actions">
   <Button disabled={busy} onClick={() => void run(async accessToken => { await uploadBackup(accessToken, project); setMessage('Google Drive에 백업을 저장했습니다.'); })}>{busy ? '처리 중…' : 'Drive에 백업 저장'}</Button>
   <Button variant="soft" disabled={busy} onClick={() => void run(async accessToken => { const restored = await downloadFromDrive(accessToken, project.id); setMessage('Drive 백업을 별도 프로젝트로 복원했습니다.'); onRestore(restored.id); })}>Drive 백업 복원</Button>
  </div>
  <p className="muted small">{token ? 'Google 인증 완료 · 액세스 토큰은 브라우저 메모리에만 유지됩니다.' : '작업 시 Google 계정 인증이 요청됩니다.'}</p>
  {message && <p role="status" className="muted">{message}</p>}
  <p className="muted small">자동 동기화는 아직 지원하지 않습니다. Drive 앱 전용 저장공간의 파일은 일반 내 드라이브 목록에 나타나지 않습니다.</p>
 </section>;
}
