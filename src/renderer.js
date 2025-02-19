const { ipcRenderer } = require('electron');

const promptInput = document.getElementById('promptInput');
const sendButton = document.getElementById('sendButton');
const refreshButton = document.getElementById('refreshButton');
const sessionButton = document.getElementById('sessionButton');
const newSessionButton = document.getElementById('newSessionButton');
const sessionsList = document.getElementById('sessionsList');
const responseDiv = document.getElementById('response');
const clipboardToggle = document.getElementById('clipboardToggle');

// Add status message element
const statusDiv = document.createElement('div');
statusDiv.id = 'statusMessage';
document.querySelector('.prompt-container').insertBefore(statusDiv, promptInput);

let isRecording = false;
let activeSessionId = null;  // Track which session is selected
let useClipboard = false;  // Default to NOT using clipboard

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

async function createNewSession() {
    const input = document.getElementById('sessionNameInput');
    const name = input.value.trim();
    if (name) {
        console.log('Creating new session:', name);
        const result = await ipcRenderer.invoke('session-action', {
            action: 'create',
            name: name
        });
        if (result.success) {
            updateSessionsList(result.sessions);
            hideCreateSessionModal();
        }
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
        
        // Move click handler to the entire session element
        sessionElement.onclick = async () => {
            const sessionViewer = document.querySelector('.session-viewer');
            const sidebar = document.querySelector('.sidebar');
            
            console.log('Session clicked:', session.id);
            
            // Toggle session selection
            if (activeSessionId === session.id) {
                activeSessionId = null;
                sessionViewer.style.display = 'none';
                updateSessionsList(sessions);
            } else {
                activeSessionId = session.id;
                console.log('Setting active session:', activeSessionId);
                
                // Make sure sidebar is visible when selecting a session
                sidebar.classList.remove('collapsed');
                sidebar.style.display = 'flex';
                
                // Ensure session viewer is visible
                sessionViewer.style.display = 'block';
                sessionViewer.innerHTML = 'Loading...';  // Show loading state
                
                // Load session content
                const result = await ipcRenderer.invoke('session-action', {
                    action: 'load',
                    id: session.id
                });
                
                if (result.success) {
                    updateSessionsList(result.sessions);
                    sessionViewer.contentEditable = true;
                    sessionViewer.innerHTML = result.notes;
                    setupSaveButton(sessionViewer);
                }
            }
        };
        
        // Create delete button
        const deleteButton = document.createElement('span');
        deleteButton.innerHTML = '🗑️';
        deleteButton.className = 'delete-session';
        deleteButton.onclick = async (e) => {
            e.stopPropagation();  // Prevent the session click event
            if (confirm(`Delete session "${session.name}"?`)) {
                if (session.id === activeSessionId) {
                    activeSessionId = null;
                }
                const result = await ipcRenderer.invoke('session-action', {
                    action: 'delete',
                    id: session.id
                });
                if (result.success) {
                    updateSessionsList(result.sessions);
                }
            }
        };
        
        sessionElement.appendChild(nameElement);
        sessionElement.appendChild(deleteButton);
        sessionsList.appendChild(sessionElement);
    });
}

async function sendPrompt() {
    const prompt = promptInput.value.trim();
    if (!prompt) return;

    showThinkingMessage();
    console.log('Sending prompt:', prompt, 'Active Session:', activeSessionId, 'Use Clipboard:', useClipboard);

    try {
        const result = await ipcRenderer.invoke('process-prompt', {
            prompt,
            sessionId: activeSessionId,
            useClipboard
        });

        hideThinkingMessage();

        if (result.success) {
            if (result.updatedNotes && result.sessionId === activeSessionId) {
                const sessionViewer = document.querySelector('.session-viewer');
                if (sessionViewer) {
                    sessionViewer.innerHTML = result.updatedNotes;
                }
            }

            if (result.conversationHistory) {
                responseDiv.innerHTML = formatChatHistory(result.conversationHistory);
                responseDiv.style.display = 'block';
            }

            if (result.sessions) {
                updateSessionsList(result.sessions);
            }
        }

        promptInput.value = '';
    } catch (error) {
        hideThinkingMessage();
        responseDiv.innerHTML = `<p class="error">Error: ${error.message}</p>`;
        responseDiv.style.display = 'block';
    }
}

async function refreshMemory() {
    try {
        // Clear the response display
        responseDiv.innerHTML = '';
        responseDiv.style.display = 'none';
        
        // Clear the input
        promptInput.value = '';
        
        const result = await ipcRenderer.invoke('refresh-memory');
        
        if (result.success) {
            if (isRecording) {
                isRecording = false;
                sessionButton.classList.remove('session-active');
                sessionButton.classList.add('session-inactive');
                await ipcRenderer.invoke('session-action', { action: 'end' });
            }
            updateSessionsList(result.sessions);
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

// Add this function to format chat messages
function formatChatHistory(messages) {
    let html = '';
    messages.forEach(message => {
        const isUser = message.role === 'user';
        const messageClass = isUser ? 'user-message' : 'assistant-message';
        html += `<div class="message ${messageClass}">
            <div class="message-content">${formatResponse(message.content)}</div>
        </div>`;
    });
    return html;
}

function setupSaveButton(sessionViewer) {
    let saveButton = document.querySelector('.save-notes-button');
    if (!saveButton) {
        saveButton = document.createElement('button');
        saveButton.className = 'save-notes-button';
        saveButton.textContent = '💾 Save';
        saveButton.onclick = async () => {
            const updatedNotes = sessionViewer.innerHTML;
            const result = await ipcRenderer.invoke('session-action', {
                action: 'update-notes',
                sessionId: activeSessionId,
                notes: updatedNotes
            });
            if (result.success) {
                updateSessionsList(result.sessions);
            }
        };
        sessionViewer.parentElement.insertBefore(saveButton, sessionViewer);
    }
}

// Add event listeners
newSessionButton.addEventListener('click', showCreateSessionModal);
sendButton.addEventListener('click', sendPrompt);
promptInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendPrompt();
    }
});

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

// Load initial sessions
async function loadInitialSessions() {
    console.log('Loading initial sessions...');
    const result = await ipcRenderer.invoke('get-sessions');
    if (result.success) {
        updateSessionsList(result.sessions);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.querySelector('.sidebar');
    sidebar.classList.add('collapsed');
    document.getElementById('toggleSessions').style.opacity = '0.7';
    loadInitialSessions();
});

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

// Add clipboard toggle button handler
clipboardToggle.addEventListener('click', () => {
    useClipboard = !useClipboard;
    clipboardToggle.classList.toggle('active', useClipboard);
    clipboardToggle.title = useClipboard ? 'Clipboard context enabled' : 'Clipboard context disabled';
});

// Add this CSS to ensure proper display
const style = document.createElement('style');
style.textContent = `
    .sidebar {
        display: flex;
        flex-direction: column;
        min-width: 300px;
        max-width: 600px;
        height: 100vh;
        background: rgba(35, 35, 35, 0.95);
        transition: all 0.3s ease;
    }
    
    .sidebar.collapsed {
        width: 0;
        min-width: 0;
        padding: 0;
        overflow: hidden;
    }
    
    .session-viewer {
        flex: 1;
        overflow-y: auto;
        padding: 15px;
        background: rgba(40, 40, 40, 0.6);
        margin: 10px;
        border-radius: 8px;
        font-size: 14px;
        line-height: 1.5;
    }
`;
document.head.appendChild(style); 