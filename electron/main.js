const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let pythonProcess;
let openaiApiKey = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 600,
        minHeight: 400,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            preload: path.join(__dirname, 'preload.js')
        },
        frame: true,
        transparent: false,
        backgroundColor: '#191919',
        alwaysOnTop: true,
        resizable: true,
        titleBarStyle: 'default'
    });

    mainWindow.loadFile('src/index.html');
    mainWindow.webContents.openDevTools({ mode: 'detach' });

    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

function startPythonBackend() {
    const scriptPath = path.join(__dirname, 'python', 'backend.py');
    console.log('Starting Python backend at:', scriptPath);
    
    pythonProcess = spawn('python', [scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
            ...process.env,
        }
    });

    let buffer = '';
    pythonProcess.stdout.on('data', (data) => {
        buffer += data.toString();
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            
            try {
                const result = JSON.parse(line);
                mainWindow.webContents.send('python-response', result);
            } catch (e) {
                console.log('Debug output:', line);
            }
        }
    });

    // Log debug messages to console
    pythonProcess.stderr.on('data', (data) => {
        console.log('Python debug:', data.toString());
    });

    pythonProcess.on('error', (error) => {
        console.error('Failed to start Python process:', error);
    });

    pythonProcess.on('exit', (code) => {
        console.log(`Python process exited with code ${code}`);
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
    console.log('Starting new session:', data);  // Debug print
    if (pythonProcess && pythonProcess.stdin) {
        const message = {
            command: 'start-session',
            name: data.name
        };
        console.log('Sending to Python:', message);  // Debug print
        pythonProcess.stdin.write(JSON.stringify(message) + '\n');
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

app.on('ready', () => {
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