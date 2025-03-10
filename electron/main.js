const { app, BrowserWindow, ipcMain, clipboard, dialog, globalShortcut } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const SessionManager = require('./services/SessionManager');
const AIService = require('./services/AIService');
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const log = require('electron-log');
const { v4: uuidv4 } = require('uuid');

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
    console.log('Processing prompt:', data);
    const clipboardContent = data.useClipboard ? clipboard.readText() : null;
    const sessionId = data.sessionId;
    const session = sessionId ? sessionManager.getSession(sessionId) : null;
    const existingNotes = session ? session.notes : "";

    if (data.loadOnly) {
        console.log('Loading conversation history for session:', sessionId);
        if (session && session.conversations) {
            const history = [];
            session.conversations.forEach(conv => {
                history.push({ role: 'user', content: conv.prompt });
                history.push({ role: 'assistant', content: conv.response });
            });
            aiService.loadConversationHistory(history);
            return {
                success: true,
                conversationHistory: aiService.getConversationHistory(),
                sessions: sessionManager.serializeSessions(),
                sessionId
            };
        }
        return { success: true, conversationHistory: [], sessions: sessionManager.serializeSessions(), sessionId };
    }

    const response = await aiService.processPrompt(
        data.prompt,
        data.useClipboard,
        clipboardContent,
        existingNotes
    );

    if (session) {
        session.addInteraction(data.prompt, response);
        await sessionManager.saveSessions();
    }

    return {
        success: true,
        response,
        conversationHistory: aiService.getConversationHistory(),
        sessions: sessionManager.serializeSessions(),
        sessionId
    };
});

ipcMain.handle('session-action', async (event, { action, ...data }) => {
    console.log('Received session action:', action, data);
    
    switch (action) {
        case 'create':
            console.log('Creating new session:', data.name, 'in folder:', data.folderId);
            const sessionId = sessionManager.createSession(data.name, data.folderId);
            return { 
                success: true, 
                sessionId, 
                sessions: sessionManager.serializeSessions() 
            };

        case 'create-folder':
            console.log('Creating folder:', data);
            const folderId = sessionManager.createFolder(data.name, data.parentId);
            console.log('Created folder with ID:', folderId);
            const folderResult = { success: true, folderId, sessions: sessionManager.serializeSessions() };
            console.log('Folder creation result:', folderResult);
            return folderResult;

        case 'delete-folder':
            console.log('Deleting folder:', data.id);
            const folderDeleted = sessionManager.deleteFolder(data.id);
            return { success: true, sessions: sessionManager.serializeSessions() };

        case 'rename-folder':
            console.log('Renaming folder:', data);
            const folderRenamed = sessionManager.renameFolder(data.id, data.name);
            return { success: true, sessions: sessionManager.serializeSessions() };

        case 'move-folder':
            console.log('Moving folder:', data);
            const folderMoved = sessionManager.moveFolder(data.id, data.parentId);
            return { success: true, sessions: sessionManager.serializeSessions() };

        case 'move-session':
            console.log('Moving session:', data.sessionId, 'to folder:', data.targetFolderId);
            const moved = sessionManager.moveSession(data.sessionId, data.targetFolderId);
            return { 
                success: moved, 
                sessions: sessionManager.serializeSessions() 
            };

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

        case 'generate-summary':
            const summarySession = sessionManager.getSession(data.sessionId);
            if (!summarySession) {
                throw new Error(`Session ${data.sessionId} not found`);
            }
            
            const summaryResult = await aiService.generateSummary(data.existingNotes);
            
            if (!summaryResult.noNewContent) {
                summarySession.notes = summaryResult.summary;
                await sessionManager.saveSessions();
            }
            
            return {
                success: true,
                summary: summaryResult.summary,
                noNewContent: summaryResult.noNewContent,
                sessions: sessionManager.serializeSessions()
            };

        case 'insert-last-response':
            console.log('=== Processing insert-last-response action ===');
            const insertSession = sessionManager.getSession(data.sessionId);
            console.log('Session found:', insertSession ? insertSession.id : 'null');
            
            if (!insertSession) {
                console.log('Session not found:', data.sessionId);
                throw new Error(`Session ${data.sessionId} not found`);
            }
            
            console.log('Calling aiService.insertLastResponse');
            const insertResult = await aiService.insertLastResponse(data.existingNotes);
            console.log('Insert result:', insertResult);
            
            if (!insertResult.noNewContent) {
                console.log('Updating session notes');
                insertSession.notes = insertResult.summary;
                await sessionManager.saveSessions();
            } else {
                console.log('No new content to update');
            }
            
            return {
                success: true,
                summary: insertResult.summary,
                noNewContent: insertResult.noNewContent,
                sessions: sessionManager.serializeSessions()
            };

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
    
    // Register global shortcut
    const shortcutRegistered = globalShortcut.register('CommandOrControl+I', () => {
        console.log('Global shortcut CommandOrControl+I triggered');
        if (mainWindow) {
            console.log('Sending trigger-insert-last-response to renderer process');
            try {
                mainWindow.webContents.send('trigger-insert-last-response');
                console.log('Message sent successfully');
            } catch (error) {
                console.error('Error sending message to renderer:', error);
            }
        } else {
            console.log('mainWindow is not available');
        }
    });

    const saveShortcutRegistered = globalShortcut.register('CommandOrControl+S', () => {
        console.log('Global shortcut CommandOrControl+S triggered');
        if (mainWindow) {
            console.log('Sending trigger-save-notes to renderer process');
            try {
                mainWindow.webContents.send('trigger-save-notes');
                console.log('Message sent successfully');
            } catch (error) {
                console.error('Error sending message to renderer:', error);
            }
        } else {
            console.log('mainWindow is not available');
        }
    });

    if (!shortcutRegistered || !saveShortcutRegistered) {
        console.log('Shortcut registration failed');
    } else {
        console.log('Shortcuts registered successfully');
    }
    
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

// Add cleanup of shortcuts
app.on('will-quit', () => {
    globalShortcut.unregisterAll();
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