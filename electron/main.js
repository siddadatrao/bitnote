const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const { globalShortcut } = require('electron');

let mainWindow;
let pythonProcess;
let openaiApiKey = null;

function ensureAppDirectories() {
    const appDataPath = path.join(app.getPath('userData'), 'BitNote');
    console.log('Attempting to create directory at:', appDataPath);
    console.log('userData path:', app.getPath('userData'));
    
    try {
        if (!fs.existsSync(appDataPath)) {
            fs.mkdirSync(appDataPath, { recursive: true });
            console.log('Successfully created directory');
        } else {
            console.log('Directory already exists');
        }
        // Test write permissions
        const testFile = path.join(appDataPath, 'test.txt');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        console.log('Successfully tested write permissions');
    } catch (error) {
        console.error('Error creating/accessing directory:', error);
        console.error('Will try to create in home directory instead');
        const homePath = path.join(require('os').homedir(), 'BitNote');
        fs.mkdirSync(homePath, { recursive: true });
        return homePath;
    }
    
    return appDataPath;
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 600,
        minHeight: 400,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
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

function startPythonBackend() {
    const isDev = process.defaultApp || /[\\/]electron-prebuilt[\\/]/.test(process.execPath);
    const appDataPath = ensureAppDirectories();
    
    if (isDev) {
        // In development mode, run the Python script directly
        const scriptPath = path.join(__dirname, 'python', 'backend.py');
        console.log('Starting Python in dev mode:', scriptPath);
        pythonProcess = spawn('python', [scriptPath], {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: {
                ...process.env,
                NODE_ENV: 'development',
                APP_DATA_PATH: appDataPath,
                PATH: process.env.PATH
            }
        });
        
        // Add error handler for development debugging
        pythonProcess.on('error', (error) => {
            console.error('Failed to start Python process:', error);
            console.error('Script path:', scriptPath);
        });
    } else {
        // In production mode, use the compiled binary
        const appPath = path.join(process.resourcesPath, 'app');
        const scriptPath = path.join(appPath, 'electron', 'python', 'dist', 'backend');
        pythonProcess = spawn(scriptPath, [], {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: {
                ...process.env,
                NODE_ENV: 'production',
                APP_DATA_PATH: appDataPath,
                PATH: process.env.PATH
            }
        });
    }

    // Add general error handling
    pythonProcess.stderr.on('data', (data) => {
        console.error('Python stderr:', data.toString());
    });

    setupPythonProcessHandlers(pythonProcess);
}

function setupPythonProcessHandlers(process) {
    let buffer = '';
    process.stdout.on('data', (data) => {
        buffer += data.toString();
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            try {
                const result = JSON.parse(line);
                if (mainWindow) {
                    mainWindow.webContents.send('python-response', result);
                }
            } catch (e) {
            }
        }
    });

    process.stderr.on('data', (data) => {
    });

    process.on('exit', (code) => {
        if (code !== 0) {
            setTimeout(startPythonBackend, 1000);
        }
    });
}

// Handle IPC messages from renderer
ipcMain.on('send-prompt', (event, data) => {
    console.log('Main process received send-prompt:', data);
    if (pythonProcess && pythonProcess.stdin) {
        pythonProcess.stdin.write(JSON.stringify(data) + '\n');
    }
});

ipcMain.on('start-session', (event, data) => {
    console.log('\n=== Received start-session request ===');
    console.log('Data:', data);
    console.log('Python process exists:', !!pythonProcess);
    console.log('Python stdin writable:', !!(pythonProcess && pythonProcess.stdin));
    
    if (pythonProcess && pythonProcess.stdin) {
        const message = {
            command: 'start-session',
            name: data.name
        };
        console.log('Sending to Python:', message);
        pythonProcess.stdin.write(JSON.stringify(message) + '\n');
    } else {
        console.error('Python process not available');
    }
});

ipcMain.on('end-session', (event) => {
    if (pythonProcess && pythonProcess.stdin) {
        pythonProcess.stdin.write(JSON.stringify({ command: 'end-session' }) + '\n');
    }
});

ipcMain.on('load-session', (event, data) => {
    if (pythonProcess && pythonProcess.stdin) {
        pythonProcess.stdin.write(JSON.stringify({ 
            command: 'load-session',
            id: data.id 
        }) + '\n');
    }
});

ipcMain.on('delete-session', (event, data) => {
    if (pythonProcess && pythonProcess.stdin) {
        pythonProcess.stdin.write(JSON.stringify({ 
            command: 'delete-session',
            id: data.id 
        }) + '\n');
    }
});

ipcMain.on('refresh-memory', (event) => {
    if (pythonProcess && pythonProcess.stdin) {
        pythonProcess.stdin.write(JSON.stringify({ 
            command: 'refresh-memory' 
        }) + '\n');
    }
});

ipcMain.on('load-initial-sessions', (event) => {
    if (pythonProcess && pythonProcess.stdin) {
        pythonProcess.stdin.write(JSON.stringify({ 
            command: 'get-sessions' 
        }) + '\n');
    }
});

ipcMain.on('set-api-key', (event, data) => {
    openaiApiKey = data.key;
    if (pythonProcess && pythonProcess.stdin) {
        pythonProcess.stdin.write(JSON.stringify({ 
            command: 'set-api-key',
            key: data.key 
        }) + '\n');
    }
});

ipcMain.on('check-api-key', (event) => {
    if (pythonProcess && pythonProcess.stdin) {
        pythonProcess.stdin.write(JSON.stringify({ 
            command: 'check-api-key'
        }) + '\n');
    }
});

ipcMain.on('update-notes', (event, data) => {
    if (pythonProcess && pythonProcess.stdin) {
        pythonProcess.stdin.write(JSON.stringify({ 
            command: 'update-notes',
            sessionId: data.sessionId,
            notes: data.notes
        }) + '\n');
    }
});

app.whenReady().then(() => {
    console.log('\n=== App Starting ===');
    createWindow();
    startPythonBackend();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
    if (pythonProcess) {
        pythonProcess.kill();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

// Clean up shortcuts
app.on('will-quit', () => {
    globalShortcut.unregisterAll();
}); 