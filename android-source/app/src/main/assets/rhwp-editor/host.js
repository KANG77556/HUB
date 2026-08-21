import { createEditor } from './sdk/index.js';

const statusNode = document.getElementById('status');
const MAX_RHWP_EDITOR_BYTES = 50 * 1024 * 1024;
let editor = null;

function setStatus(message, error = false) {
  statusNode.className = error ? 'error' : '';
  statusNode.textContent = message;
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  if (binary.length > MAX_RHWP_EDITOR_BYTES) throw new Error('문서 크기가 50MB를 초과합니다.');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes) {
  if (bytes.length > MAX_RHWP_EDITOR_BYTES) throw new Error('편집 결과가 50MB를 초과합니다.');
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

window.openRhwpEditorFromBase64 = async (base64, fileName) => {
  setStatus('문서를 편집기로 불러오는 중입니다.');
  try {
    if (editor) editor.destroy();
    editor = await createEditor('#editor', {
      studioUrl: new URL('./studio/index.html', location.href).href,
      renderer: 'canvas2d',
      requestTimeoutMs: 60000,
      handshakeTimeoutMs: 1500,
    });
    const bytes = base64ToBytes(base64);
    await editor.loadFile(bytes, fileName || 'document.hwp', { suppressDialogs: true });
    statusNode.className = 'ready';
    statusNode.textContent = '';
    return true;
  } catch (error) {
    setStatus(`HWP/HWPX 편집기를 열 수 없습니다.\n${error?.message || error}`, true);
    throw error;
  }
};

window.exportEditedBase64 = async (format) => {
  if (!editor) throw new Error('편집기가 준비되지 않았습니다.');
  const bytes = format === 'hwpx' ? await editor.exportHwpx() : await editor.exportHwp();
  return bytesToBase64(bytes);
};

window.notifyRhwpSaved = async (fileName) => {
  if (!editor) return false;
  try {
    await editor.notifySaved(fileName);
    return true;
  } catch {
    return false;
  }
};

window.addEventListener('error', event => setStatus(`편집기 오류\n${event.message || '알 수 없는 오류'}`, true));
window.addEventListener('unhandledrejection', event => setStatus(`편집기 처리 오류\n${event.reason?.message || event.reason || '알 수 없는 오류'}`, true));
