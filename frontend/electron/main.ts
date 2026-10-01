import { app, BrowserWindow, ipcMain, nativeImage, shell, Menu } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, '..');

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
    ? path.join(process.env.APP_ROOT, 'public')
    : RENDERER_DIST;

// ── Logging ──────────────────────────────────────────────────────────────────
const logFile = path.join(app.getPath('userData'), 'app.log');

function logToFile(msg: string) {
    try {
        const timestamp = new Date().toISOString();
        const formatted = `[${timestamp}] ${msg}\n`;
        fs.mkdirSync(path.dirname(logFile), { recursive: true });
        fs.appendFileSync(logFile, formatted);
        console.log(msg);
    } catch (e) {
        console.error('Failed to write to log file:', e);
    }
}

try {
    if (fs.existsSync(logFile)) {
        fs.truncateSync(logFile);
    }
} catch (e) {
    console.error('Failed to truncate log file:', e);
}

logToFile(`[main] Log initialized: ${logFile}`);
logToFile(`[main] Version: ${app.getVersion()}`);

if (process.platform === 'win32') {
    app.setAppUserModelId('com.pgray.app');
}

let win: BrowserWindow | null = null;
let localBackend: ChildProcess | null = null;
let localApiPort: number | null = null;

app.setName('PGRay');

// ── Local backend (pgray-backend binary) ─────────────────────────────────────
function getLocalBinaryPath(): string | null {
    const binaryName = process.platform === 'win32' ? 'pgray-backend.exe' : 'pgray-backend';

    // Packaged: resources/ next to app.asar
    const packaged = path.join(process.resourcesPath ?? '', binaryName);
    logToFile(`[backend] Checking packaged path: ${packaged}`);
    if (fs.existsSync(packaged)) return packaged;

    // Dev: resources/ inside frontend/
    const dev = path.join(process.env.APP_ROOT ?? path.join(__dirname, '..'), 'resources', binaryName);
    logToFile(`[backend] Checking dev path: ${dev}`);
    if (fs.existsSync(dev)) return dev;

    return null;
}

function checkBackendReady(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
            resolve(res.statusCode === 200);
            res.resume();
        });
        req.on('error', () => resolve(false));
        req.setTimeout(1000, () => {
            req.destroy();
            resolve(false);
        });
    });
}

function startLocalBackend(): Promise<number> {
    return new Promise((resolve, reject) => {
        const binaryPath = getLocalBinaryPath();
        if (!binaryPath) {
            const err = new Error('pgray-backend binary not found');
            logToFile(`[backend] ERROR: ${err.message}`);
            reject(err);
            return;
        }

        const dataDir = path.join(os.homedir(), '.pgray');
        logToFile(`[backend] Starting ${binaryPath} --port 9000 --data-dir ${dataDir}`);

        localBackend = spawn(binaryPath, ['--port', '9000', '--data-dir', dataDir], {
            stdio: ['ignore', 'pipe', 'pipe'],
            cwd: path.dirname(binaryPath),
        });

        let resolved = false;
        let stdoutBuf = '';

        localBackend.stdout?.on('data', (chunk: Buffer) => {
            stdoutBuf += chunk.toString();
            const lines = stdoutBuf.split('\n');
            stdoutBuf = lines.pop() ?? '';
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed) logToFile(`[backend][stdout] ${trimmed}`);
                const m = trimmed.match(/^LISTENING:(\d+)/);
                if (m && !resolved) {
                    resolved = true;
                    localApiPort = parseInt(m[1], 10);
                    logToFile(`[backend] API ready on port ${localApiPort}`);
                    resolve(localApiPort);
                }
            }
        });

        localBackend.stderr?.on('data', (chunk: Buffer) => {
            const trimmed = chunk.toString().trim();
            if (trimmed) logToFile(`[backend][stderr] ${trimmed}`);
            // Also detect uvicorn startup message in stderr as fallback
            const m = trimmed.match(/Uvicorn running on http:\/\/127\.0\.0\.1:(\d+)/);
            if (m && !resolved) {
                resolved = true;
                localApiPort = parseInt(m[1], 10);
                logToFile(`[backend] Detected Uvicorn ready on port ${localApiPort}`);
                resolve(localApiPort);
            }
        });

        localBackend.on('error', (err) => {
            logToFile(`[backend] Spawn error: ${err.message}`);
            if (!resolved) reject(err);
        });

        localBackend.on('exit', (code, signal) => {
            logToFile(`[backend] exited code=${code} signal=${signal}`);
            localBackend = null;
        });

        setTimeout(async () => {
            if (!resolved) {
                if (await checkBackendReady(9000)) {
                    resolved = true;
                    localApiPort = 9000;
                    resolve(9000);
                } else {
                    const err = new Error('Timed out waiting for pgray-backend to start');
                    logToFile(`[backend] ERROR: ${err.message}`);
                    reject(err);
                }
            }
        }, 30_000);
    });
}

function stopLocalBackend() {
    if (localBackend) {
        logToFile('[backend] Stopping...');
        localBackend.kill('SIGTERM');
        localBackend = null;
    }
}

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.handle('get-local-api-url', () =>
    localApiPort ? `http://127.0.0.1:${localApiPort}` : 'http://127.0.0.1:9000'
);

ipcMain.on('open-external', (_, url: string) => {
    if (url) shell.openExternal(url);
});

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow() {
    win = new BrowserWindow({
        width: 1440,
        height: 900,
        show: false,
        backgroundColor: '#0f172a',
        title: 'PGRay',
        icon: path.join(process.env.VITE_PUBLIC!, 'pgray_256.png'),
        webPreferences: {
            preload: (() => {
                const jsPath = path.join(__dirname, 'preload.js');
                const mjsPath = path.join(__dirname, 'preload.mjs');
                return fs.existsSync(jsPath) ? jsPath : mjsPath;
            })(),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            webSecurity: false,
        },
    });

    win.once('ready-to-show', () => {
        if (win) {
            win.show();
            win.focus();
        }
    });

    const iconPath = path.join(process.env.VITE_PUBLIC!, 'pgray_256.png');
    if (fs.existsSync(iconPath)) {
        const appIcon = nativeImage.createFromPath(iconPath);
        if (!appIcon.isEmpty()) {
            win.setIcon(appIcon);
            if (process.platform === 'darwin' && app.dock) {
                app.dock.setIcon(appIcon);
            }
        }
    }

    const template: Electron.MenuItemConstructorOptions[] = [
        ...(process.platform === 'darwin'
            ? [
                  {
                      label: app.name,
                      submenu: [
                          { role: 'about' as const },
                          { type: 'separator' as const },
                          { role: 'hide' as const },
                          { role: 'hideOthers' as const },
                          { role: 'unhide' as const },
                          { type: 'separator' as const },
                          { role: 'quit' as const },
                      ],
                  },
              ]
            : []),
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' },
            ],
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' },
            ],
        },
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                { role: 'zoom' },
                { role: 'close' },
            ],
        },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));

    const portParam = String(localApiPort || 9000);
    if (VITE_DEV_SERVER_URL) {
        const sep = VITE_DEV_SERVER_URL.includes('?') ? '&' : '?';
        win.loadURL(`${VITE_DEV_SERVER_URL}${sep}apiPort=${portParam}`);
    } else {
        win.loadFile(path.join(RENDERER_DIST, 'index.html'), {
            query: { apiPort: portParam },
        });
    }
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
    try {
        await startLocalBackend();
        logToFile('[main] Local backend ready');
    } catch (err: any) {
        logToFile(`[main] CRITICAL: Failed to start backend: ${err.message}`);
    }
    createWindow();
});

app.on('before-quit', () => {
    stopLocalBackend();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        stopLocalBackend();
        app.quit();
        win = null;
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
