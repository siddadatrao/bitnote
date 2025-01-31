const { ipcRenderer } = require('electron');

const promptInput = document.getElementById('promptInput');
const sendButton = document.getElementById('sendButton');
const refreshButton = document.getElementById('refreshButton');
const sessionButton = document.getElementById('sessionButton');
const newSessionButton = document.getElementById('newSessionButton');
const sessionsList = document.getElementById('sessionsList');
const responseDiv = document.getElementById('response');

// Add status message element
const statusDiv = document.createElement('div');
statusDiv.id = 'statusMessage';
document.querySelector('.prompt-container').insertBefore(statusDiv, promptInput);

let isRecording = false;
let activeSessionId = null;  // Track which session is selected
let apiKeySubmitted = false;

const thinkingMessages = [
    "Pondering the mysteries of code...",
    "Consulting the digital oracle...",
    "Crunching numbers in cyberspace...",
    "Mining for digital wisdom...",
    "Processing in parallel universes...",
    "Analyzing quantum possibilities...",
    "Searching the knowledge matrix..."
];

function showThinkingMessage() {
    statusDiv.style.display = 'block';
    const message = thinkingMessages[Math.floor(Math.random() * thinkingMessages.length)];
    statusDiv.textContent = message;
}

function hideThinkingMessage() {
    statusDiv.style.display = 'none';
}

function showCreateSessionModal() {
    const modal = document.getElementById('createSessionModal');
    const input = document.getElementById('sessionNameInput');
    modal.style.display = 'block';
    input.value = '';
    input.focus();
}

function hideCreateSessionModal() {
    const modal = document.getElementById('createSessionModal');
    modal.style.display = 'none';
}

function createNewSession() {
    const input = document.getElementById('sessionNameInput');
    const name = input.value.trim();
    if (name) {
        console.log('Creating new session:', name);
        ipcRenderer.send('start-session', {
            command: 'start-session',
            name: name
        });
        hideCreateSessionModal();
    }
}

function updateSessionsList(sessions) {
    console.log('Updating sessions list with:', sessions);
    sessionsList.innerHTML = '';
    
    // Add session viewer div if it doesn't exist
    let sessionViewer = document.querySelector('.session-viewer');
    if (!sessionViewer) {
        sessionViewer = document.createElement('div');
        sessionViewer.className = 'session-viewer';
        document.querySelector('.sidebar').appendChild(sessionViewer);
    }
    
    // Clear session viewer and hide it if no sessions
    if (!sessions || Object.keys(sessions).length === 0) {
        console.log('No sessions to display');
        sessionViewer.innerHTML = '';
        sessionViewer.style.display = 'none';
        return;
    }
    
    // Show session viewer if we have sessions
    sessionViewer.style.display = 'block';
    
    Object.values(sessions).forEach(session => {
        const sessionElement = document.createElement('div');
        sessionElement.className = `session-item ${session.id === activeSessionId ? 'active' : ''}`;
        
        // Create session name element
        const nameElement = document.createElement('span');
        nameElement.textContent = session.name;
        nameElement.onclick = () => {
            const sessionViewer = document.querySelector('.session-viewer');
            
            // Always clear the current content first
            sessionViewer.innerHTML = '';
            
            // Toggle session selection
            if (activeSessionId === session.id) {
                activeSessionId = null;
                sessionViewer.style.display = 'none';
                updateSessionsList(sessions);
            } else {
                activeSessionId = session.id;
                updateSessionsList(sessions);
                // Load session content into side viewer
                sessionViewer.style.display = 'block';
                ipcRenderer.send('load-session', { id: session.id });
            }
        };
        
        // Create delete button
        const deleteButton = document.createElement('span');
        deleteButton.innerHTML = '🗑️';
        deleteButton.className = 'delete-session';
        deleteButton.onclick = (e) => {
            e.stopPropagation();
            if (confirm(`Delete session "${session.name}"?`)) {
                if (session.id === activeSessionId) {
                    activeSessionId = null;
                }
                ipcRenderer.send('delete-session', { id: session.id });
            }
        };
        
        sessionElement.appendChild(nameElement);
        sessionElement.appendChild(deleteButton);
        sessionsList.appendChild(sessionElement);
    });
}

function showApiKeyModal() {
    const modal = document.getElementById('apiKeyModal');
    const input = document.getElementById('apiKeyInput');
    modal.style.display = 'block';
    input.value = '';
    input.focus();
}

function submitApiKey() {
    const input = document.getElementById('apiKeyInput');
    const key = input.value.trim();
    if (key && key.startsWith('sk-')) {
        ipcRenderer.send('set-api-key', { key });
        document.getElementById('apiKeyModal').style.display = 'none';
        apiKeySubmitted = true;
    } else {
        alert('Please enter a valid OpenAI API key starting with "sk-"');
    }
}

function sendPrompt() {
    const prompt = promptInput.value.trim();
    if (!prompt) return;

    if (!apiKeySubmitted) {
        showApiKeyModal();
        return;
    }

    showThinkingMessage();
    console.log('Sending prompt:', prompt, 'Active Session:', activeSessionId);

    // Send prompt with session ID if a session is selected
    const message = {
        prompt,
        sessionId: activeSessionId,  // This will be null if no session is selected
        command: 'send-prompt'
    };

    console.log('Sending message:', message);
    ipcRenderer.send('send-prompt', message);
    promptInput.value = '';
}

function refreshMemory() {
    try {
        // Clear the response display
        responseDiv.innerHTML = '';
        responseDiv.style.display = 'none';
        
        // Clear the input
        promptInput.value = '';
        
        // Send refresh command to backend
        ipcRenderer.send('refresh-memory');
        
        // If we're recording, stop the session
        if (isRecording) {
            isRecording = false;
            sessionButton.classList.remove('session-active');
            sessionButton.classList.add('session-inactive');
            ipcRenderer.send('end-session');
        }
    } catch (error) {
        responseDiv.textContent = `Error: ${error.message}`;
        responseDiv.style.display = 'block';
    }
}

function formatCodeBlock(code) {
    // Remove the initial ``` and language identifier if present
    code = code.replace(/^```\w*\n/, '').replace(/```$/, '');
    return `<pre><code>${code}</code></pre>`;
}

function formatResponse(response) {
    if (!response) return '';
    
    const blocks = response.split('```');
    let formatted = '';
    let isCode = false;
    
    blocks.forEach(block => {
        if (isCode) {
            formatted += formatCodeBlock(block);
        } else {
            // Format regular text with better spacing and structure
            formatted += block
                .split('\n')
                .map(line => {
                    line = line.trim();
                    if (!line) return '<br>';
                    if (line.startsWith('•') || line.startsWith('-')) {
                        return `<li>${line.substring(1).trim()}</li>`;
                    }
                    if (line.startsWith('#')) {
                        const level = line.match(/^#+/)[0].length;
                        const text = line.replace(/^#+\s*/, '');
                        return `<h${level}>${text}</h${level}>`;
                    }
                    return `<p>${line}</p>`;
                })
                .join('\n');
        }
        isCode = !isCode;
    });

    // Wrap lists in ul tags
    formatted = formatted.replace(/<li>(.+?)<\/li>/g, '<ul><li>$1</li></ul>');
    // Fix nested lists
    formatted = formatted.replace(/<\/ul>\s*<ul>/g, '');
    
    return `<div class="formatted-response">${formatted}</div>`;
}

// Update the python-response handler
ipcRenderer.on('python-response', (event, data) => {
    console.log('Received response:', data);
    hideThinkingMessage();
    
    if (data.success) {
        let sessionViewer = document.querySelector('.session-viewer');
        
        if (data.sessions) {
            console.log('Updating sessions with:', data.sessions);
            updateSessionsList(data.sessions);
        }
        
        if (data.response) {
            // If it's a session response (has HTML formatting)
            if (typeof data.response === 'string' && 
                (data.response.includes('<h2>') || data.response.includes('<ul>'))) {
                if (sessionViewer) {
                    sessionViewer.innerHTML = data.response;
                    // Only hide if there are truly no notes
                    if (data.response === "No notes available yet") {
                        sessionViewer.style.display = 'none';
                    } else {
                        sessionViewer.style.display = 'block';
                        // Clear any "no notes" message from the main view
                        if (responseDiv.textContent === "No notes available yet") {
                            responseDiv.innerHTML = '';
                        }
                    }
                }
            } else {
                // Regular chat response
                responseDiv.innerHTML = formatResponse(data.response);
                responseDiv.style.display = 'block';
            }
        }
    } else {
        console.error('Error:', data.error);
        responseDiv.innerHTML = `<p class="error">Error: ${data.error}</p>`;
        responseDiv.style.display = 'block';
    }
});

// Add event listeners
newSessionButton.addEventListener('click', showCreateSessionModal);
sendButton.addEventListener('click', sendPrompt);
promptInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendPrompt();
    }
});

// Add refresh button event listener
refreshButton.addEventListener('click', refreshMemory);

// Update event listeners
document.getElementById('createSessionConfirm').addEventListener('click', createNewSession);
document.getElementById('createSessionCancel').addEventListener('click', hideCreateSessionModal);
document.getElementById('sessionNameInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        createNewSession();
    }
    if (e.key === 'Escape') {
        hideCreateSessionModal();
    }
});

// Add these event listeners for the API key modal
document.getElementById('submitApiKey').addEventListener('click', submitApiKey);
document.getElementById('apiKeyInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        submitApiKey();
    }
});

// Add this function to load initial sessions
function loadInitialSessions() {
    console.log('Loading initial sessions...');
    ipcRenderer.send('load-initial-sessions');
}

// Add this to the end of the file
loadInitialSessions();

// Add this near your other event listeners
document.getElementById('toggleSessions').addEventListener('click', () => {
    const sidebar = document.querySelector('.sidebar');
    const button = document.getElementById('toggleSessions');
    
    sidebar.classList.toggle('collapsed');
    
    // Update button appearance
    if (sidebar.classList.contains('collapsed')) {
        button.style.opacity = '0.7';
    } else {
        button.style.opacity = '1';
    }
});

// Start with sidebar collapsed
document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.querySelector('.sidebar');
    sidebar.classList.add('collapsed');
    document.getElementById('toggleSessions').style.opacity = '0.7';
    
    // Check API key on startup
    checkApiKey();
});

// Add handler for API key errors
ipcRenderer.on('api-key-error', () => {
    apiKeySubmitted = false;
    showApiKeyModal();
});

// Add this function to check API key status
function checkApiKey() {
    ipcRenderer.send('check-api-key');
}

// Add this handler for API key check response
ipcRenderer.on('api-key-status', (event, data) => {
    console.log('API key status:', data);
    if (data.success && data.hasKey) {
        apiKeySubmitted = true;
        // Hide the modal if it's showing
        document.getElementById('apiKeyModal').style.display = 'none';
    } else {
        apiKeySubmitted = false;
        showApiKeyModal();
    }
}); 