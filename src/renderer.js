const { ipcRenderer } = require('electron');

const promptInput = document.getElementById('promptInput');
const sendButton = document.getElementById('sendButton');
const refreshButton = document.getElementById('refreshButton');
const addbitButton = document.getElementById('addbitButton');
const sessionButton = document.getElementById('sessionButton');
const newSessionButton = document.getElementById('newSessionButton');
const sessionsList = document.getElementById('sessionsList');
const responseDiv = document.getElementById('response');
const clipboardToggle = document.getElementById('clipboardToggle');

// Add status message element
const statusDiv = document.createElement('div');
statusDiv.id = 'statusMessage';
document.querySelector('.prompt-container').insertBefore(statusDiv, promptInput);

// Add keyboard shortcut hint element
const shortcutHint = document.createElement('div');
shortcutHint.className = 'shortcut-hint';
shortcutHint.innerHTML = `<span>${process.platform === 'darwin' ? '⌘' : 'Ctrl'}+I to add last message • ${process.platform === 'darwin' ? '⌘' : 'Ctrl'}+S to save</span>`;
document.querySelector('.prompt-container').appendChild(shortcutHint);

let isRecording = false;
let activeSessionId = null;
let useClipboard = false;

const thinkingMessages = {
    default: [
        "Pondering the mysteries of code...",
        "Consulting the digital oracle...",
        "Crunching numbers in cyberspace...",
        "Mining for digital wisdom...",
        "Processing in parallel universes...",
        "Analyzing quantum possibilities...",
        "Searching the knowledge matrix..."
    ],
    summarizing: [
        "Organizing your thoughts...",
        "Crafting your summary...",
        "Integrating new insights...",
        "Structuring knowledge..."
    ]
};

function showThinkingMessage(type = 'default') {
    statusDiv.classList.add('visible');
    statusDiv.className = type === 'summarizing' ? 'status-message summarizing visible' : 'status-message visible';
    const messages = thinkingMessages[type] || thinkingMessages.default;
    const message = messages[Math.floor(Math.random() * messages.length)];
    statusDiv.textContent = message;
}

function hideThinkingMessage() {
    statusDiv.classList.remove('visible');
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
        
        // Create session info container
        const infoContainer = document.createElement('div');
        infoContainer.className = 'session-info';
        
        // Create session name element
        const nameElement = document.createElement('span');
        nameElement.className = 'session-name';
        nameElement.textContent = session.name;
        
        // Create metadata element
        const metaElement = document.createElement('span');
        metaElement.className = 'session-meta';
        const date = new Date(session.created_at);
        metaElement.textContent = `Created ${date.toLocaleDateString()} • ${session.conversation_count || 0} messages`;
        
        // Add elements to info container
        infoContainer.appendChild(nameElement);
        infoContainer.appendChild(metaElement);
        
        // Create delete button
        const deleteButton = document.createElement('span');
        deleteButton.innerHTML = '🗑️';
        deleteButton.className = 'delete-session';
        deleteButton.title = 'Delete session';
        deleteButton.onclick = async (e) => {
            e.stopPropagation();
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
        
        // Add click handler to the session element
        sessionElement.onclick = async () => {
            const sessionViewer = document.querySelector('.session-viewer');
            const sidebar = document.querySelector('.sidebar');
            
            console.log('Session clicked:', session.id);
            
            if (activeSessionId === session.id) {
                activeSessionId = null;
                sessionViewer.style.display = 'none';
                updateSessionsList(sessions);
            } else {
                activeSessionId = session.id;
                console.log('Setting active session:', activeSessionId);
                
                sidebar.classList.remove('collapsed');
                sidebar.style.display = 'flex';
                
                sessionViewer.style.display = 'block';
                sessionViewer.innerHTML = 'Loading...';
                
                // First load the session to get conversation history
                const loadResult = await ipcRenderer.invoke('session-action', {
                    action: 'load',
                    id: session.id
                });
                
                if (loadResult.success) {
                    console.log('Session loaded, updating conversation history');
                    // Update conversation history
                    const result = await ipcRenderer.invoke('process-prompt', {
                        prompt: '',
                        sessionId: session.id,
                        useClipboard: false,
                        loadOnly: true
                    });
                    
                    if (result.success && result.conversationHistory) {
                        console.log('Conversation history updated:', result.conversationHistory);
                        // Clear any existing content and scroll position
                        responseDiv.innerHTML = '';
                        responseDiv.scrollTop = 0;
                        
                        // Add the new content
                        responseDiv.innerHTML = formatChatHistory(result.conversationHistory);
                        responseDiv.style.display = 'block';
                        
                        // Scroll to the last response
                        scrollToLastResponse();
                    }
                    
                    updateSessionsList(loadResult.sessions);
                    sessionViewer.contentEditable = true;
                    sessionViewer.innerHTML = loadResult.notes;
                    setupSaveButton(sessionViewer);
                }
            }
        };
        
        // Assemble the session item
        sessionElement.appendChild(infoContainer);
        sessionElement.appendChild(deleteButton);
        sessionsList.appendChild(sessionElement);
    });
}

// Update the scrollToLastResponse function
function scrollToLastResponse() {
    const messages = responseDiv.querySelectorAll('.message');
    if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        // Add a small delay to ensure the DOM is fully updated
        setTimeout(() => {
            lastMessage.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'end',
                inline: 'nearest'
            });
            // Reset any extra spacing that might have been added
            responseDiv.style.scrollPaddingBottom = '0';
        }, 100);
    }
}

function scrollToRecentResponse() {
    responseDiv.scrollTop = 0;
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
            if (result.conversationHistory) {
                responseDiv.innerHTML = formatChatHistory(result.conversationHistory);
                responseDiv.style.display = 'block';
                // Scroll to the last response after it's added
                setTimeout(scrollToLastResponse, 100);
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

async function addbit() {
    if (!activeSessionId) {
        const notification = document.createElement('div');
        notification.className = 'update-notification';
        notification.innerHTML = 'Please create or select a session first';
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
        return;
    }

    showThinkingMessage();
    try {
        const sessionViewer = document.querySelector('.session-viewer');
        const currentNotes = sessionViewer ? sessionViewer.innerHTML : '';

        const result = await ipcRenderer.invoke('session-action', {
            action: 'generate-summary',
            sessionId: activeSessionId,
            existingNotes: currentNotes
        });

        hideThinkingMessage();

        if (result.success) {
            if (result.noNewContent) {
                // Show notification if there's nothing new to summarize
                const notification = document.createElement('div');
                notification.className = 'update-notification success';
                notification.innerHTML = 'No new content to summarize since last summary';
                document.body.appendChild(notification);
                setTimeout(() => notification.remove(), 3000);
            } else {
                // Update the session viewer with new summary
                if (sessionViewer) {
                    sessionViewer.innerHTML = result.summary;
                }
                // Show success notification
                const notification = document.createElement('div');
                notification.className = 'update-notification success';
                notification.innerHTML = 'Summary generated successfully';
                document.body.appendChild(notification);
                setTimeout(() => notification.remove(), 3000);
            }
            updateSessionsList(result.sessions);
        }
    } catch (error) {
        hideThinkingMessage();
        const notification = document.createElement('div');
        notification.className = 'update-notification error';
        notification.innerHTML = `Error generating summary: ${error.message}`;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 5000);
    }
}

async function insertLastResponse() {
    console.log('=== insertLastResponse called in renderer ===');
    if (!activeSessionId) {
        console.log('No active session');
        const notification = document.createElement('div');
        notification.className = 'update-notification';
        notification.innerHTML = 'Please create or select a session first';
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
        return;
    }

    console.log('Active session:', activeSessionId);
    showThinkingMessage('summarizing');
    try {
        const sessionViewer = document.querySelector('.session-viewer');
        const currentNotes = sessionViewer ? sessionViewer.innerHTML : '';
        console.log('Current notes length:', currentNotes.length);

        console.log('Invoking session-action with insert-last-response');
        const result = await ipcRenderer.invoke('session-action', {
            action: 'insert-last-response',
            sessionId: activeSessionId,
            existingNotes: currentNotes
        });
        console.log('Received result:', result);

        hideThinkingMessage();

        if (result.success) {
            if (result.noNewContent) {
                console.log('No new content to insert');
                const notification = document.createElement('div');
                notification.className = 'update-notification';
                notification.innerHTML = 'No recent response to insert';
                document.body.appendChild(notification);
                setTimeout(() => notification.remove(), 3000);
            } else {
                console.log('Updating session viewer with new content');
                if (sessionViewer) {
                    sessionViewer.innerHTML = result.summary;
                }
                const notification = document.createElement('div');
                notification.className = 'update-notification success';
                notification.innerHTML = 'Response added to summary';
                document.body.appendChild(notification);
                setTimeout(() => notification.remove(), 3000);
            }
            updateSessionsList(result.sessions);
        }
    } catch (error) {
        console.error('Error in insertLastResponse:', error);
        hideThinkingMessage();
        const notification = document.createElement('div');
        notification.className = 'update-notification error';
        notification.innerHTML = `Error inserting response: ${error.message}`;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 5000);
    }
}

async function refreshMemory() {
    try {
        // Clear the response display but maintain its display property
        responseDiv.innerHTML = '';
        
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
    let buttonsContainer = document.querySelector('.action-buttons-container');
    if (!buttonsContainer) {
        // Create container for both buttons
        buttonsContainer = document.createElement('div');
        buttonsContainer.className = 'action-buttons-container';
        
        // Create save button
        const saveButton = document.createElement('button');
        saveButton.className = 'action-button';
        saveButton.innerHTML = '💾 Save Changes';
        saveButton.onclick = async () => {
            const updatedNotes = sessionViewer.innerHTML;
            const result = await ipcRenderer.invoke('session-action', {
                action: 'update-notes',
                sessionId: activeSessionId,
                notes: updatedNotes
            });
            if (result.success) {
                // Show a brief success message
                const notification = document.createElement('div');
                notification.className = 'update-notification success';
                notification.innerHTML = 'Changes saved successfully!';
                document.body.appendChild(notification);
                setTimeout(() => notification.remove(), 2000);
                
                updateSessionsList(result.sessions);
            }
        };
        
        // Create PDF download button
        const downloadButton = document.createElement('button');
        downloadButton.className = 'action-button secondary';
        downloadButton.innerHTML = '📄 Download PDF';
        downloadButton.onclick = async () => {
            if (!sessionViewer || !sessionViewer.innerHTML.trim()) {
                const errorDiv = document.createElement('div');
                errorDiv.className = 'update-notification';
                errorDiv.innerHTML = 'No content to export';
                document.body.appendChild(errorDiv);
                setTimeout(() => errorDiv.remove(), 3000);
                return;
            }

            try {
                const activeSession = document.querySelector('.session-item.active');
                const sessionName = activeSession ? activeSession.querySelector('span').textContent : 'summary';

                const result = await ipcRenderer.invoke('export-to-pdf', {
                    html: sessionViewer.innerHTML,
                    sessionName
                });

                const notification = document.createElement('div');
                notification.className = `update-notification ${result.success ? 'success' : ''}`;
                notification.innerHTML = result.success 
                    ? `PDF saved successfully to: ${result.filePath}`
                    : `Failed to export PDF: ${result.message}`;
                document.body.appendChild(notification);
                setTimeout(() => notification.remove(), 5000);
            } catch (error) {
                console.error('Error exporting PDF:', error);
                const errorDiv = document.createElement('div');
                errorDiv.className = 'update-notification';
                errorDiv.innerHTML = `Error exporting PDF: ${error.message}`;
                document.body.appendChild(errorDiv);
                setTimeout(() => errorDiv.remove(), 5000);
            }
        };

        // Add buttons to container
        buttonsContainer.appendChild(saveButton);
        buttonsContainer.appendChild(downloadButton);
        
        // Insert container before the session viewer
        sessionViewer.parentNode.insertBefore(buttonsContainer, sessionViewer);
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
    console.log('=== DOM Content Loaded ===');
    const sidebar = document.querySelector('.sidebar');
    sidebar.classList.add('collapsed');
    document.getElementById('toggleSessions').style.opacity = '0.7';
    
    // Set up IPC listener for global shortcut
    console.log('Setting up trigger-insert-last-response listener');
    ipcRenderer.on('trigger-insert-last-response', () => {
        console.log('=== Received trigger-insert-last-response from main process ===');
        console.log('Active session:', activeSessionId);
        console.log('Session viewer:', document.querySelector('.session-viewer'));
        insertLastResponse();
    });

    // Set up IPC listener for save notes shortcut
    console.log('Setting up trigger-save-notes listener');
    ipcRenderer.on('trigger-save-notes', async () => {
        console.log('=== Received trigger-save-notes from main process ===');
        if (!activeSessionId) {
            const notification = document.createElement('div');
            notification.className = 'update-notification';
            notification.innerHTML = 'Please create or select a session first';
            document.body.appendChild(notification);
            setTimeout(() => notification.remove(), 3000);
            return;
        }

        const sessionViewer = document.querySelector('.session-viewer');
        if (sessionViewer) {
            const updatedNotes = sessionViewer.innerHTML;
            const result = await ipcRenderer.invoke('session-action', {
                action: 'update-notes',
                sessionId: activeSessionId,
                notes: updatedNotes
            });

            if (result.success) {
                const notification = document.createElement('div');
                notification.className = 'update-notification success';
                notification.innerHTML = 'Changes saved successfully!';
                document.body.appendChild(notification);
                setTimeout(() => notification.remove(), 2000);
                
                updateSessionsList(result.sessions);
            }
        }
    });
    
    // Verify IPC is working
    console.log('Testing IPC communication...');
    ipcRenderer.invoke('get-sessions')
        .then(() => {
            console.log('IPC communication test successful');
            loadInitialSessions();
        })
        .catch(error => {
            console.error('IPC communication test failed:', error);
        });
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

// Add refresh button handler
refreshButton.addEventListener('click', () => {
    refreshMemory();
});

// Update the addbitButton event listener
addbitButton.addEventListener('click', () => {
    addbit();
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

    .shortcut-hint {
        position: absolute;
        top: -24px;
        left: 20px;
        background: var(--surface);
        padding: 4px 12px;
        border-radius: 6px 6px 0 0;
        font-size: 11px;
        color: var(--text-secondary);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-bottom: none;
        pointer-events: none;
        z-index: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        height: 20px;
        min-width: 180px;
        white-space: nowrap;
    }

    .prompt-container {
        position: relative;
    }

    .status-message {
        position: absolute;
        top: -30px;
        right: 20px;
        padding: 4px 12px;
        color: var(--text-secondary);
        text-align: right;
        font-style: italic;
        font-size: 13px;
        z-index: 1;
    }

    .status-message.summarizing {
        color: var(--primary);
    }

    .update-notification {
        background: var(--surface);
        color: var(--text);
        padding: 8px 16px;
        border-radius: 6px;
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 1000;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        max-width: 300px;
        min-width: 200px;
        font-size: 13px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        animation: slide-in 0.3s ease-out;
        height: auto;
    }

    .update-notification.success {
        background: var(--surface);
        border: 1px solid var(--primary);
    }

    .update-notification.error {
        background: var(--surface);
        border: 1px solid rgba(255, 70, 70, 0.5);
    }

    @keyframes slide-in {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
`;
document.head.appendChild(style);

// Update handling
function showUpdateNotification(message, type = 'info') {
    // Remove existing notification if present
    if (currentNotification) {
        currentNotification.remove();
    }

    const notification = document.createElement('div');
    notification.className = `update-notification ${type}`;
    notification.innerHTML = `
        <div class="update-content">
            <div class="update-header">
                <span class="update-title">${message}</span>
                <button class="close-button">×</button>
            </div>
            <div class="progress-bar-container" style="display: none;">
                <div class="progress-bar"></div>
                <div class="progress-text">Preparing...</div>
            </div>
            <div class="update-actions"></div>
        </div>
    `;

    // Add close button handler
    notification.querySelector('.close-button').onclick = () => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 300);
    };

    document.body.appendChild(notification);
    return notification;
}

let currentNotification = null;
let downloadStartTime = null;

ipcRenderer.on('update-available', (event, info) => {
    console.log('Received update-available event:', info);
    currentNotification = showUpdateNotification(`Update v${info.version} available!`, 'info');
    const actions = currentNotification.querySelector('.update-actions');
    
    const downloadButton = document.createElement('button');
    downloadButton.className = 'primary-button';
    downloadButton.textContent = 'Download Update';
    downloadButton.onclick = async () => {
        try {
            console.log('Starting update download...');
            downloadStartTime = Date.now();
            downloadButton.disabled = true;
            downloadButton.textContent = 'Downloading...';
            
            // Show progress container immediately
            const progressContainer = currentNotification.querySelector('.progress-bar-container');
            progressContainer.style.display = 'block';
            
            const result = await ipcRenderer.invoke('start-update');
            if (!result.success) {
                throw new Error(result.error || 'Failed to start update');
            }
        } catch (error) {
            console.error('Error starting update:', error);
            showUpdateNotification(`Update error: ${error.message}`, 'error');
        }
    };
    
    const dismissButton = document.createElement('button');
    dismissButton.className = 'secondary-button';
    dismissButton.textContent = 'Later';
    dismissButton.onclick = () => {
        currentNotification.classList.add('fade-out');
        setTimeout(() => {
            currentNotification.remove();
            currentNotification = null;
        }, 300);
    };
    
    actions.appendChild(downloadButton);
    actions.appendChild(dismissButton);
});

ipcRenderer.on('download-progress', (event, progressObj) => {
    console.log('Received download progress:', progressObj);
    if (currentNotification) {
        const progressBar = currentNotification.querySelector('.progress-bar');
        const progressText = currentNotification.querySelector('.progress-text');
        const percent = Math.round(progressObj.percent);
        
        progressBar.style.width = `${percent}%`;
        
        // Calculate download speed and remaining time
        const elapsedTime = (Date.now() - downloadStartTime) / 1000; // in seconds
        const speed = progressObj.bytesPerSecond;
        const totalSize = progressObj.total;
        const downloaded = progressObj.transferred;
        const remaining = (totalSize - downloaded) / speed;
        
        // Format sizes
        const formatSize = (bytes) => {
            if (bytes < 1024) return `${bytes} B`;
            if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
            return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        };
        
        // Format time
        const formatTime = (seconds) => {
            if (seconds < 60) return `${Math.round(seconds)}s`;
            const minutes = Math.floor(seconds / 60);
            const secs = Math.round(seconds % 60);
            return `${minutes}m ${secs}s`;
        };
        
        const downloadSpeed = formatSize(speed) + '/s';
        const remainingTime = formatTime(remaining);
        const progress = `${formatSize(downloaded)} / ${formatSize(totalSize)}`;
        
        progressText.innerHTML = `
            <div class="progress-details">
                <span>${percent}%</span>
                <span>${progress}</span>
                <span>${downloadSpeed}</span>
                <span>${remainingTime} remaining</span>
            </div>
        `;
    }
});

ipcRenderer.on('update-downloaded', () => {
    if (currentNotification) {
        currentNotification.remove();
    }
    
    currentNotification = showUpdateNotification(
        'Update downloaded! Restart the app to apply the update.',
        'success'
    );
    
    const actions = currentNotification.querySelector('.update-actions');
    
    const restartButton = document.createElement('button');
    restartButton.className = 'primary-button';
    restartButton.textContent = 'Restart Now';
    restartButton.onclick = () => {
        ipcRenderer.invoke('quit-and-install');
    };
    
    const laterButton = document.createElement('button');
    laterButton.className = 'secondary-button';
    laterButton.textContent = 'Later';
    laterButton.onclick = () => {
        currentNotification.classList.add('fade-out');
        setTimeout(() => {
            currentNotification.remove();
            currentNotification = null;
        }, 300);
    };
    
    actions.appendChild(restartButton);
    actions.appendChild(laterButton);
});

ipcRenderer.on('update-not-available', () => {
    console.log('No updates available');
});

// Check for updates periodically (every 30 minutes)
setInterval(() => {
    ipcRenderer.invoke('check-for-updates');
}, 30 * 60 * 1000);

// Initial update check
ipcRenderer.invoke('check-for-updates');

// Add this after the other event listeners
document.getElementById('downloadPdfButton').addEventListener('click', async () => {
    const sessionViewer = document.querySelector('.session-viewer');
    if (!sessionViewer || !sessionViewer.innerHTML.trim()) {
        // Show error if no content
        const errorDiv = document.createElement('div');
        errorDiv.className = 'update-notification';
        errorDiv.innerHTML = 'No content to export';
        document.body.appendChild(errorDiv);
        setTimeout(() => errorDiv.remove(), 3000);
        return;
    }

    try {
        // Get session name if available
        const activeSession = document.querySelector('.session-item.active');
        const sessionName = activeSession ? activeSession.querySelector('span').textContent : 'summary';

        const result = await ipcRenderer.invoke('export-to-pdf', {
            html: sessionViewer.innerHTML,
            sessionName
        });

        // Show success/error notification
        const notification = document.createElement('div');
        notification.className = `update-notification ${result.success ? 'success' : ''}`;
        notification.innerHTML = result.success 
            ? `PDF saved successfully to: ${result.filePath}`
            : `Failed to export PDF: ${result.message}`;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 5000);
    } catch (error) {
        console.error('Error exporting PDF:', error);
        const errorDiv = document.createElement('div');
        errorDiv.className = 'update-notification';
        errorDiv.innerHTML = `Error exporting PDF: ${error.message}`;
        document.body.appendChild(errorDiv);
        setTimeout(() => errorDiv.remove(), 5000);
    }
});

// Add this to verify the renderer process is loaded
console.log('Renderer process initialized'); 