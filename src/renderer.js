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
let useClipboard = true;  // Default to using clipboard

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
        
        // Move click handler to the entire session element
        sessionElement.onclick = () => {
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
                sidebar.style.display = 'flex';  // Ensure sidebar is displayed
                
                // Ensure session viewer is visible
                sessionViewer.style.display = 'block';
                sessionViewer.innerHTML = 'Loading...';  // Show loading state
                
                updateSessionsList(sessions);
                
                // Load session content into side viewer
                ipcRenderer.send('load-session', { id: session.id });
            }
        };
        
        // Create delete button
        const deleteButton = document.createElement('span');
        deleteButton.innerHTML = '🗑️';
        deleteButton.className = 'delete-session';
        deleteButton.onclick = (e) => {
            e.stopPropagation();  // Prevent the session click event
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

function sendPrompt() {
    const prompt = promptInput.value.trim();
    if (!prompt) return;

    showThinkingMessage();
    console.log('Sending prompt:', prompt, 'Active Session:', activeSessionId);

    // Send prompt with session ID if a session is selected
    const message = {
        prompt,
        sessionId: activeSessionId,
        useClipboard: useClipboard,
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

// Update the python-response handler
ipcRenderer.on('python-response', (event, data) => {
    console.log('Received response:', data);
    console.log('Response type:', data.type);
    console.log('Active session:', activeSessionId);
    console.log('Session ID in response:', data.sessionId);
    hideThinkingMessage();
    
    if (data.success) {
        let sessionViewer = document.querySelector('.session-viewer');
        let sidebar = document.querySelector('.sidebar');
        
        // Ensure elements exist
        if (!sessionViewer || !sidebar) {
            console.error('Required elements not found:', { sessionViewer, sidebar });
            return;
        }
        
        console.log('Session viewer element:', sessionViewer);
        console.log('Sidebar element:', sidebar);
        
        if (data.sessions) {
            console.log('Updating sessions with:', data.sessions);
            updateSessionsList(data.sessions);
        }
        
        if (data.response) {
            // Handle notes update
            if (data.type === 'notes_update' && data.sessionId === activeSessionId) {
                console.log('Updating notes for session:', data.sessionId);
                if (sessionViewer) {
                    // Ensure sidebar is visible
                    sidebar.classList.remove('collapsed');
                    sidebar.style.display = 'flex';
                    sessionViewer.contentEditable = true;
                    sessionViewer.style.display = 'block';
                    sessionViewer.innerHTML = data.response;
                    setupSaveButton(sessionViewer);
                    console.log('Updated session viewer content length:', data.response.length);
                }
                return;
            }
            
            // Handle initial session load
            if (data.sessionId === activeSessionId && sessionViewer) {
                console.log('Loading initial session content');
                sidebar.classList.remove('collapsed');
                sidebar.style.display = 'flex';
                sessionViewer.contentEditable = true;
                sessionViewer.style.display = 'block';
                sessionViewer.innerHTML = data.response;
                setupSaveButton(sessionViewer);
                console.log('Loaded initial session content length:', data.response.length);
                return;
            }
            
            // Handle chat history (left side)
            if (data.conversation_history) {
                responseDiv.innerHTML = formatChatHistory(data.conversation_history);
                responseDiv.style.display = 'block';
            }
        }
    } else {
        console.error('Error:', data.error);
        responseDiv.innerHTML = `<p class="error">Error: ${data.error}</p>`;
        responseDiv.style.display = 'block';
    }
});

// Helper function to setup save button
function setupSaveButton(sessionViewer) {
    let saveButton = document.querySelector('.save-notes-button');
    if (!saveButton) {
        saveButton = document.createElement('button');
        saveButton.className = 'save-notes-button';
        saveButton.textContent = '💾 Save';
        saveButton.onclick = () => {
            const updatedNotes = sessionViewer.innerHTML;
            ipcRenderer.send('update-notes', {
                sessionId: activeSessionId,
                notes: updatedNotes
            });
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
});

// Add clipboard toggle button handler
const clipboardToggle = document.getElementById('clipboardToggle');
// Set initial state
clipboardToggle.classList.toggle('active', useClipboard);
clipboardToggle.title = useClipboard ? 'Clipboard context enabled' : 'Clipboard context disabled';

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