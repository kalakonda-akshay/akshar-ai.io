const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs   = require('fs');
const http = require('http');
const { spawn } = require('child_process');

let mainWindow;
let backendProcess = null;
let PORT = 52700;

// ── FIND FREE PORT ────────────────────────────────────────────────────────────
function findFreePort(start) {
  start = start || 52700;
  return new Promise(function(resolve) {
    const server = require('net').createServer();
    server.listen(start, '127.0.0.1', function() {
      const port = server.address().port;
      server.close(function() { resolve(port); });
    });
    server.on('error', function() { resolve(findFreePort(start + 1)); });
  });
}

// ── START BACKEND ─────────────────────────────────────────────────────────────
function startBackend() {
  const serverFile = path.join(__dirname, '../../backend/server.js');
  backendProcess = spawn(process.execPath, [serverFile], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  backendProcess.stdout.on('data', d => console.log('[backend]', d.toString().trim()));
  backendProcess.stderr.on('data', d => console.error('[backend-err]', d.toString().trim()));
  backendProcess.on('error', e => console.error('Failed to start backend:', e.message));
  backendProcess.on('exit', code => console.log('Backend exited with code', code));
}

// ── WAIT FOR BACKEND TO BE READY ──────────────────────────────────────────────
function waitForBackend(maxAttempts = 20) {
  return new Promise((resolve) => {
    let attempts = 0;
    function check() {
      attempts++;
      const req = http.get(`http://127.0.0.1:${PORT}/health`, res => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try {
            const j = JSON.parse(body);
            if (j.ok) { console.log('Backend ready!'); resolve(true); }
            else retry();
          } catch { retry(); }
        });
      });
      req.on('error', retry);
      req.setTimeout(1000, () => { req.destroy(); retry(); });
      function retry() {
        if (attempts >= maxAttempts) { console.warn('Backend did not start in time'); resolve(false); return; }
        setTimeout(check, 500);
      }
    }
    check();
  });
}

// ── CREATE WINDOW ─────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1100, minHeight: 700,
    frame: false, backgroundColor: '#07070f',
    webPreferences: { nodeIntegration: true, contextIsolation: false, webSecurity: false },
    show: false
  });
  mainWindow.loadFile(path.join(__dirname, '../renderer/pages/login.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  // Find a free port (avoids EADDRINUSE if old instance didn't shut down)
  PORT = await findFreePort(52700);
  console.log('Using port:', PORT);

  // Grant microphone + media permissions so Voice Notes works
  const { session } = require('electron');
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['media', 'microphone', 'audioCapture', 'notifications'];
    callback(allowed.includes(permission));
  });
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    const allowed = ['media', 'microphone', 'audioCapture', 'notifications'];
    return allowed.includes(permission);
  });

  startBackend();
  await waitForBackend();
  createWindow();
});

app.on('window-all-closed', () => {
  if (backendProcess) { try { backendProcess.kill(); } catch(e) {} }
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ── WINDOW CONTROLS ───────────────────────────────────────────────────────────
ipcMain.on('win-min',   () => mainWindow && mainWindow.minimize());
ipcMain.on('win-max',   () => { if (!mainWindow) return; mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize(); });
ipcMain.on('win-close', () => { try { if (backendProcess) backendProcess.kill(); } catch(e) {} mainWindow && mainWindow.close(); });

// ── DATA STORE ────────────────────────────────────────────────────────────────
function dataDir() {
  const d = path.join(app.getPath('userData'), 'appdata');
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  return d;
}
ipcMain.handle('db-set', async (e, { key, val }) => {
  try { fs.writeFileSync(path.join(dataDir(), key + '.json'), JSON.stringify(val)); return true; }
  catch(err) { console.error('db-set error:', err); return false; }
});
ipcMain.handle('db-get', async (e, key) => {
  const fp = path.join(dataDir(), key + '.json');
  if (!fs.existsSync(fp)) return null;
  try { return JSON.parse(fs.readFileSync(fp, 'utf-8')); } catch { return null; }
});

// ── FILE DIALOG ───────────────────────────────────────────────────────────────
ipcMain.handle('file-open', async (e, opts = {}) => {
  const filters = opts.all
    ? [{ name: 'All Files', extensions: ['pdf','docx','txt','pptx','png','jpg','mp4','zip'] }]
    : [{ name: 'Documents', extensions: ['pdf','docx','txt','pptx'] }];
  const r = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('file-read', async (e, fp) => {
  try {
    const d = fs.readFileSync(fp);
    return { data: d.toString('base64'), ext: path.extname(fp).toLowerCase(), name: path.basename(fp) };
  } catch(err) { return { error: err.message }; }
});

// ── RESOURCES ─────────────────────────────────────────────────────────────────
function resDir() {
  const d = path.join(app.getPath('userData'), 'resources');
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  return d;
}
ipcMain.handle('res-save', async (e, { name, data, ext }) => {
  try {
    const safeName = name.replace(/[<>:"/\\|?*]/g, '_');
    fs.writeFileSync(path.join(resDir(), safeName), Buffer.from(data, 'base64'));
    return { ok: true, name: safeName };
  } catch(err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('res-list', async () => {
  try {
    const dir = resDir();
    return fs.readdirSync(dir).map(f => ({
      name: f,
      ext: path.extname(f).toLowerCase(),
      path: path.join(dir, f),
      size: fs.statSync(path.join(dir, f)).size
    }));
  } catch { return []; }
});
ipcMain.handle('res-open', async (e, name) => {
  const fp = path.join(resDir(), name);
  if (fs.existsSync(fp)) {
    const result = await shell.openPath(fp);
    return result === '' ? { ok: true } : { ok: false, error: result };
  }
  return { ok: false, error: 'File not found' };
});
ipcMain.handle('res-del', async (e, name) => {
  try {
    const fp = path.join(resDir(), name);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    return true;
  } catch { return false; }
});

// ── EXPOSE PORT ───────────────────────────────────────────────────────────────
ipcMain.handle('get-port', async () => PORT);
