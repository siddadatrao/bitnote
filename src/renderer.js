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
let activeSessionId = null;
let useClipboard = false;

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
                
                refreshMemory();

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
        
        // Assemble the session item
        sessionElement.appendChild(infoContainer);
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

// Add refresh button handler
refreshButton.addEventListener('click', () => {
    refreshMemory();
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