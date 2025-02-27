const { app, BrowserWindow, ipcMain, clipboard, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const SessionManager = require('./services/SessionManager');
const AIService = require('./services/AIService');
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const log = require('electron-log');

let mainWindow;
let sessionManager;
let aiService;
let extendedClipboard;

// Configure auto updater
autoUpdater.autoDownload = false;
autoUpdater.logger = require('electron-log');
autoUpdater.logger.transports.file.level = 'info';

// Configure update settings
autoUpdater.channel = 'latest';
autoUpdater.allowDowngrade = false;
autoUpdater.allowPrerelease = false;

// Log paths and config
autoUpdater.logger.info('App path:', app.getPath('userData'));
autoUpdater.logger.info('Cache path:', app.getPath('cache'));

async function initialize() {
    sessionManager = new SessionManager();
    aiService = new AIService();
    await sessionManager.initialize();
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 600,
        minHeight: 400,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        frame: true,
        transparent: false,
        backgroundColor: '#191919',
        resizable: true,
        titleBarStyle: 'default'
    });

    mainWindow.loadFile('src/index.html');

    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

// IPC Handlers
ipcMain.handle('process-prompt', async (event, data) => {
    const clipboardContent = data.useClipboard ? clipboard.readText() : null;
    const sessionId = data.sessionId;
    const session = sessionId ? sessionManager.getSession(sessionId) : null;
    const existingNotes = session ? session.notes : "";

    const response = await aiService.processPrompt(
        data.prompt,
        data.useClipboard,
        clipboardContent,
        existingNotes
    );

    if (session) {
        session.addInteraction(data.prompt, response);
        
        // Generate updated notes
        const updatedNotes = await aiService.generateNotes(
            { prompt: data.prompt, response },
            session.notes
        );
        
        session.notes = updatedNotes;
        await sessionManager.saveSessions();

        // Send both chat response and notes update
        return {
            success: true,
            response,
            updatedNotes,
            conversationHistory: aiService.getConversationHistory(),
            sessions: sessionManager.serializeSessions(),
            sessionId
        };
    }

    return {
        success: true,
        response,
        conversationHistory: aiService.getConversationHistory(),
        sessions: sessionManager.serializeSessions()
    };
});

ipcMain.handle('session-action', async (event, { action, ...data }) => {
    switch (action) {
        case 'create':
            const sessionId = sessionManager.createSession(data.name);
            return { success: true, sessionId, sessions: sessionManager.serializeSessions() };

        case 'end':
            sessionManager.endSession();
            return { success: true, sessions: sessionManager.serializeSessions() };

        case 'load':
            const session = sessionManager.getSession(data.id);
            if (!session) {
                throw new Error(`Session ${data.id} not found`);
            }
            return {
                success: true,
                notes: session.notes || "No notes available yet",
                sessionId: session.id,
                sessions: sessionManager.serializeSessions()
            };

        case 'delete':
            const deleted = sessionManager.deleteSession(data.id);
            return { success: true, sessions: sessionManager.serializeSessions() };

        case 'update-notes':
            const updated = sessionManager.updateSessionNotes(data.sessionId, data.notes);
            return { success: true, sessions: sessionManager.serializeSessions() };

        default:
            throw new Error(`Unknown session action: ${action}`);
    }
});

ipcMain.handle('get-sessions', async () => {
    return {
        success: true,
        sessions: sessionManager.serializeSessions()
    };
});

ipcMain.handle('refresh-memory', async () => {
    aiService.refreshMemory();
    return {
        success: true,
        sessions: sessionManager.serializeSessions()
    };
});

// Add auto-update handlers
ipcMain.handle('check-for-updates', async () => {
    try {
        console.log('Checking for updates...');
        autoUpdater.logger.info('Manually checking for updates');
        const result = await autoUpdater.checkForUpdates();
        console.log('Check update result:', result);
        autoUpdater.logger.info('Check update result:', result);
        
        if (result?.updateInfo) {
            autoUpdater.logger.info('Update info:', {
                version: result.updateInfo.version,
                files: result.updateInfo.files,
                path: result.updateInfo.path
            });
        }
        
        return { success: true, updateAvailable: !!result?.updateInfo };
    } catch (error) {
        console.error('Error checking for updates:', error);
        autoUpdater.logger.error('Error checking for updates:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('start-update', async () => {
    try {
        console.log('Starting update download...');
        autoUpdater.logger.info('Starting update download');
        
        // Log available update files
        const updateInfo = await autoUpdater.getUpdateInfoAndProvider();
        autoUpdater.logger.info('Available update files:', updateInfo?.info?.files);
        
        await autoUpdater.downloadUpdate();
        return { success: true };
    } catch (error) {
        console.error('Error downloading update:', error);
        autoUpdater.logger.error('Error downloading update:', error);
        return { success: false, error: error.message };
    }
});

// Add handler for quit and install
ipcMain.handle('quit-and-install', () => {
    autoUpdater.logger.info('Quitting and installing update');
    autoUpdater.quitAndInstall();
});

// Auto updater events
autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info);
    autoUpdater.logger.info('Update available:', info);
    if (mainWindow) {
        mainWindow.webContents.send('update-available', info);
    }
});

autoUpdater.on('update-not-available', (info) => {
    console.log('Update not available:', info);
    autoUpdater.logger.info('Update not available:', info);
    if (mainWindow) {
        mainWindow.webContents.send('update-not-available');
    }
});

autoUpdater.on('download-progress', (progressObj) => {
    console.log('Download progress:', progressObj);
    autoUpdater.logger.info('Download progress:', progressObj);
    if (mainWindow) {
        mainWindow.webContents.send('download-progress', progressObj);
    }
});

autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info);
    autoUpdater.logger.info('Update downloaded:', info);
    if (mainWindow) {
        mainWindow.webContents.send('update-downloaded');
    }
});

// Add error logging
autoUpdater.on('error', (err) => {
    console.error('AutoUpdater error:', err);
    autoUpdater.logger.error('AutoUpdater error:', err);
    if (mainWindow) {
        mainWindow.webContents.send('update-error', err.message);
    }
});

// Add this before the export-to-pdf handler
log.transports.file.level = 'info';

ipcMain.handle('export-to-pdf', async (event, { html, sessionName }) => {
    let browser = null;
    try {
        log.info('Starting PDF export process');
        log.info('Platform:', process.platform);
        log.info('Chrome path:', puppeteer.executablePath());

        // Configure Puppeteer launch options for better cross-platform support
        const puppeteerOptions = {
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--disable-extensions'
            ]
        };

        // Add special handling for Linux systems
        if (process.platform === 'linux') {
            log.info('Linux system detected, using chromium-browser');
            puppeteerOptions.executablePath = '/usr/bin/chromium-browser';
        }

        log.info('Launching Puppeteer with options:', puppeteerOptions);
        browser = await puppeteer.launch(puppeteerOptions);
        log.info('Browser launched successfully');

        const page = await browser.newPage();
        log.info('New page created');
        
        // Set viewport for consistent rendering
        await page.setViewport({
            width: 1200,
            height: 800,
            deviceScaleFactor: 1
        });
        
        // Set content with better error handling
        await page.setContent(html, { 
            waitUntil: ['networkidle0', 'load', 'domcontentloaded'],
            timeout: 30000 
        });

        // Add styling with better font fallbacks
        await page.addStyleTag({
            content: `
                body {
                    font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif;
                    padding: 20px;
                    color: #333;
                    line-height: 1.6;
                }
                h2 { color: #2d5af7; margin: 1em 0 0.5em; }
                pre { 
                    background: #f5f5f5; 
                    padding: 10px; 
                    border-radius: 4px; 
                    overflow-x: auto;
                    white-space: pre-wrap;
                }
                code { 
                    font-family: 'Courier New', Courier, monospace; 
                    font-size: 0.9em;
                }
            `
        });

        // Show save dialog with error handling
        const { filePath, canceled } = await dialog.showSaveDialog({
            title: 'Save PDF',
            defaultPath: path.join(app.getPath('downloads'), `${sessionName || 'summary'}.pdf`),
            filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
        });

        if (canceled || !filePath) {
            throw new Error('Export cancelled by user');
        }

        // Generate PDF with better options
        await page.pdf({
            path: filePath,
            format: 'A4',
            printBackground: true,
            margin: {
                top: '20px',
                right: '20px',
                bottom: '20px',
                left: '20px'
            },
            preferCSSPageSize: true,
            displayHeaderFooter: true,
            headerTemplate: '<div></div>',
            footerTemplate: '<div style="font-size: 8px; padding: 0 20px; width: 100%; text-align: center;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'
        });

        return { success: true, filePath };
    } catch (error) {
        console.error('Error exporting PDF:', error);
        return { 
            success: false, 
            message: `PDF export failed: ${error.message}. Please make sure you have sufficient disk space and permissions.`
        };
    } finally {
        // Ensure browser is always closed
        if (browser) {
            try {
                await browser.close();
            } catch (error) {
                console.error('Error closing browser:', error);
            }
        }
    }
});

// App lifecycle
app.whenReady().then(async () => {
    console.log('\n=== App Starting ===');
    extendedClipboard = require('electron-clipboard-extended');
    await initialize();
    createWindow();
    
    // Check for updates after app is ready
    if (!app.isPackaged) {
        console.log('App is in development mode. Skipping update check.');
        return;
    }
    
    try {
        await autoUpdater.checkForUpdates();
    } catch (error) {
        console.error('Error checking for updates:', error);
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
}); 