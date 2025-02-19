const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const SessionManager = require('./services/SessionManager');
const AIService = require('./services/AIService');

let mainWindow;
let sessionManager;
let aiService;
let clipboard;

async function initialize() {
    sessionManager = new SessionManager();
    aiService = new AIService();
    await sessionManager.initialize();
    clipboard = require('electron-clipboard-extended');
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

// App lifecycle
app.whenReady().then(async () => {
    console.log('\n=== App Starting ===');
    await initialize();
    createWindow();
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