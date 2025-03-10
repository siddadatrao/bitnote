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
    const folderSelect = document.getElementById('sessionFolderSelect');
    
    // Populate folder dropdown
    folderSelect.innerHTML = '<option value="">Root</option>';
    const addFoldersToSelect = (folders) => {
        for (const [id, folder] of Object.entries(folders)) {
            if (id !== 'root') {
                folderSelect.innerHTML += `<option value="${folder.id}">${folder.name}</option>`;
                if (folder.children) {
                    Object.values(folder.children).forEach(childFolder => {
                        folderSelect.innerHTML += `<option value="${childFolder.id}">&nbsp;&nbsp;${childFolder.name}</option>`;
                    });
                }
            }
        }
    };
    
    // Get current folders
    ipcRenderer.invoke('get-sessions').then(result => {
        if (result.success && result.sessions.folders) {
            addFoldersToSelect(result.sessions.folders);
        }
    });

    modal.style.display = 'block';
    input.value = '';
    input.focus();

    // Show sidebar
    const sidebar = document.querySelector('.sidebar');
    sidebar.classList.remove('collapsed');
    document.getElementById('toggleSessions').style.opacity = '1';
}

function hideCreateSessionModal() {
    const modal = document.getElementById('createSessionModal');
    modal.style.display = 'none';
}

async function createNewSession() {
    const input = document.getElementById('sessionNameInput');
    const folderSelect = document.getElementById('sessionFolderSelect');
    const name = input.value.trim();
    const folderId = folderSelect.value || null;
    
    if (name) {
        console.log('Creating new session:', name, 'in folder:', folderId);
        const result = await ipcRenderer.invoke('session-action', {
            action: 'create',
            name: name,
            folderId: folderId
        });
        
        if (result.success) {
            console.log('Session created successfully:', result);
            // Force a refresh of the sessions list to ensure proper folder structure
            const refreshResult = await ipcRenderer.invoke('get-sessions');
            if (refreshResult.success) {
                console.log('Refreshing sessions list after creation');
                updateSessionsList(refreshResult.sessions);
            }
            hideCreateSessionModal();
            
            // Show success notification
            const notification = document.createElement('div');
            notification.className = 'update-notification success';
            notification.innerHTML = `Session "${name}" created successfully`;
            document.body.appendChild(notification);
            setTimeout(() => notification.remove(), 3000);
        } else {
            console.error('Failed to create session:', result);
            // Show error notification
            const notification = document.createElement('div');
            notification.className = 'update-notification error';
            notification.innerHTML = 'Failed to create session';
            document.body.appendChild(notification);
            setTimeout(() => notification.remove(), 3000);
        }
    }
}

function updateSessionsList(sessionsData) {
    console.log('Updating sessions list with:', JSON.stringify(sessionsData, null, 2));
    
    // Store the expansion state of folders before updating
    const expandedFolders = new Set();
    document.querySelectorAll('.folder-content').forEach(content => {
        if (!content.classList.contains('collapsed')) {
            const folderId = content.closest('.folder-container').dataset.folderId;
            expandedFolders.add(folderId);
        }
    });
    
    sessionsList.innerHTML = '';
    
    if (!sessionsData || !sessionsData.folders) {
        console.log('No sessions data to display');
        return;
    }

    // Create new folder button
    const newFolderButton = document.createElement('button');
    newFolderButton.className = 'new-folder-button';
    newFolderButton.innerHTML = '📁 New Folder';
    newFolderButton.onclick = () => {
        console.log('New folder button clicked');
        showCreateFolderModal();
    };
    sessionsList.appendChild(newFolderButton);

    // Create folders container
    const foldersContainer = document.createElement('div');
    foldersContainer.className = 'folders-container';
    sessionsList.appendChild(foldersContainer);

    // Recursively create folder structure
    function createFolderElement(folder, parentElement) {
        console.log('Creating folder element:', JSON.stringify(folder, null, 2));
        const folderElement = document.createElement('div');
        folderElement.className = 'folder-container';
        folderElement.dataset.folderId = folder.id;
        
        // Add drag and drop handlers for the folder
        folderElement.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const draggingElement = document.querySelector('.dragging');
            if (draggingElement) {
                folderElement.classList.add('drag-over');
            }
        });

        folderElement.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            folderElement.classList.remove('drag-over');
        });

        folderElement.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            folderElement.classList.remove('drag-over');
            
            const sessionId = e.dataTransfer.getData('text/plain');
            if (sessionId) {
                console.log('Moving session:', sessionId, 'to folder:', folder.id);
                const result = await ipcRenderer.invoke('session-action', {
                    action: 'move-session',
                    sessionId: sessionId,
                    targetFolderId: folder.id === 'root' ? null : folder.id
                });
                
                if (result.success) {
                    console.log('Session moved successfully');
                    // Force a refresh of the sessions list
                    const refreshResult = await ipcRenderer.invoke('get-sessions');
                    if (refreshResult.success) {
                        updateSessionsList(refreshResult.sessions);
                    }
                } else {
                    console.error('Failed to move session');
                    // Show error notification
                    const notification = document.createElement('div');
                    notification.className = 'update-notification error';
                    notification.innerHTML = 'Failed to move session to folder';
                    document.body.appendChild(notification);
                    setTimeout(() => notification.remove(), 3000);
                }
            }
        });
        
        // Create folder header
        const folderHeader = document.createElement('div');
        folderHeader.className = 'folder-header';
        
        // Add expand/collapse toggle
        const toggleButton = document.createElement('span');
        toggleButton.className = 'folder-toggle';
        toggleButton.innerHTML = '▼';
        folderHeader.appendChild(toggleButton);
        
        // Add folder name
        const folderName = document.createElement('span');
        folderName.className = 'folder-name';
        folderName.innerHTML = `${folder.id === 'root' ? '📂' : '📁'} ${folder.name}`;
        folderHeader.appendChild(folderName);
        
        // Add folder actions if not root
        if (folder.id !== 'root') {
            const actionsContainer = document.createElement('div');
            actionsContainer.className = 'folder-actions';
            
            // New folder button
            const newSubfolderButton = document.createElement('button');
            newSubfolderButton.innerHTML = '📁+';
            newSubfolderButton.title = 'Create subfolder';
            newSubfolderButton.onclick = (e) => {
                e.stopPropagation();
                showCreateFolderModal(folder.id);
            };
            
            // Rename button
            const renameButton = document.createElement('button');
            renameButton.innerHTML = '✏️';
            renameButton.title = 'Rename folder';
            renameButton.onclick = (e) => {
                e.stopPropagation();
                renameFolder(folder.id, folder.name);
            };
            
            // Delete button
            const deleteButton = document.createElement('button');
            deleteButton.innerHTML = '🗑️';
            deleteButton.title = 'Delete folder';
            deleteButton.onclick = (e) => {
                e.stopPropagation();
                deleteFolder(folder.id);
            };
            
            actionsContainer.appendChild(newSubfolderButton);
            actionsContainer.appendChild(renameButton);
            actionsContainer.appendChild(deleteButton);
            folderHeader.appendChild(actionsContainer);
        }
        
        folderElement.appendChild(folderHeader);
        
        // Create folder content container
        const folderContent = document.createElement('div');
        folderContent.className = 'folder-content';
        
        // Check if this folder was previously expanded
        if (!expandedFolders.has(folder.id)) {
            folderContent.classList.add('collapsed');
            toggleButton.classList.add('collapsed');
        }
        
        // Add click handler for the entire header
        folderHeader.onclick = (e) => {
            e.stopPropagation();
            const isExpanded = !folderContent.classList.contains('collapsed');
            folderContent.classList.toggle('collapsed');
            toggleButton.classList.toggle('collapsed');
            toggleButton.innerHTML = '▼';
        };
        
        // Add sessions
        if (folder.sessions && folder.sessions.length > 0) {
            console.log('Adding sessions to folder:', folder.id, folder.sessions);
            const sessionsContainer = document.createElement('div');
            sessionsContainer.className = 'folder-sessions';
            
            folder.sessions.forEach(sessionId => {
                const session = sessionsData.sessions[sessionId];
                if (session) {
                    const sessionElement = createSessionElement(session, sessionsData);
                    sessionsContainer.appendChild(sessionElement);
                }
            });
            
            folderContent.appendChild(sessionsContainer);
        }
        
        // Add child folders recursively
        if (folder.children) {
            console.log('Adding child folders to:', folder.id, Object.keys(folder.children));
            Object.values(folder.children).forEach(childFolder => {
                createFolderElement(childFolder, folderContent);
            });
        }
        
        folderElement.appendChild(folderContent);
        parentElement.appendChild(folderElement);
    }

    // Start with root folder
    console.log('Starting folder creation with root:', JSON.stringify(sessionsData.folders.root, null, 2));
    createFolderElement(sessionsData.folders.root, foldersContainer);
}

// Helper function to create session elements
function createSessionElement(session, sessionsData) {
    console.log('Creating session element:', session);
    const sessionElement = document.createElement('div');
    sessionElement.className = `session-item${session.is_current ? ' active' : ''}`;
    sessionElement.draggable = true;
    sessionElement.dataset.sessionId = session.id;
    
    // Add active state if this is the current session
    if (session.id === activeSessionId || session.is_current) {
        sessionElement.classList.add('active');
    }
    
    sessionElement.innerHTML = `
        <div class="session-info">
            <span class="session-name">${session.name}</span>
            <span class="session-meta">
                ${session.conversation_count} messages • 
                ${new Date(session.created_at).toLocaleDateString()}
            </span>
        </div>
        <span class="delete-session">🗑️</span>
    `;
    
    // Add drag and drop handlers
    sessionElement.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', session.id);
        sessionElement.classList.add('dragging');
    });

    sessionElement.addEventListener('dragend', () => {
        sessionElement.classList.remove('dragging');
    });
    
    // Add click handler for session selection
    sessionElement.onclick = async () => {
        const result = await ipcRenderer.invoke('session-action', {
            action: 'load',
            id: session.id
        });
        
        if (result.success) {
            // Remove active class from all sessions
            document.querySelectorAll('.session-item').forEach(item => {
                item.classList.remove('active');
            });
            
            // Add active class to this session
            sessionElement.classList.add('active');
            activeSessionId = session.id;
            
            const sessionViewer = document.querySelector('.session-viewer');
            if (sessionViewer) {
                sessionViewer.innerHTML = result.notes;
                sessionViewer.setAttribute('contenteditable', 'true');
                setupSaveButton(sessionViewer);
            }
        }
    };
    
    // Add delete handler
    const deleteButton = sessionElement.querySelector('.delete-session');
    deleteButton.onclick = async (e) => {
        e.stopPropagation();
        if (confirm('Delete this session?')) {
            const result = await ipcRenderer.invoke('session-action', {
                action: 'delete',
                id: session.id
            });
            
            if (result.success) {
                updateSessionsList(result.sessions);
            }
        }
    };
    
    return sessionElement;
}

// Add folder management functions
async function createFolder(name, parentId = null) {
    console.log('Creating folder:', { name, parentId });
    if (!name) return;
    
    try {
        const result = await ipcRenderer.invoke('session-action', {
            action: 'create-folder',
            name,
            parentId
        });
        
        console.log('Create folder result:', result);
        
        if (result.success) {
            console.log('Updating sessions list with:', result.sessions);
            updateSessionsList(result.sessions);
        }
    } catch (error) {
        console.error('Error creating folder:', error);
    }
}

async function deleteFolder(folderId) {
    if (confirm('Delete this folder? All sessions will be moved to root.')) {
        const result = await ipcRenderer.invoke('session-action', {
            action: 'delete-folder',
            id: folderId
        });
        
        if (result.success) {
            updateSessionsList(result.sessions);
        }
    }
}

async function renameFolder(folderId, currentName) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Rename Folder</h3>
            <input type="text" class="modal-input" placeholder="Enter folder name" value="${currentName}" autofocus>
            <div class="modal-actions">
                <button class="primary-button">Rename</button>
                <button class="secondary-button">Cancel</button>
            </div>
        </div>
    `;
    
    const input = modal.querySelector('input');
    const renameButton = modal.querySelector('.primary-button');
    const cancelButton = modal.querySelector('.secondary-button');
    
    // Select the text in the input
    input.select();
    
    renameButton.onclick = async () => {
        const newName = input.value.trim();
        if (newName && newName !== currentName) {
            const result = await ipcRenderer.invoke('session-action', {
                action: 'rename-folder',
                id: folderId,
                name: newName
            });
            
            if (result.success) {
                updateSessionsList(result.sessions);
            }
        }
        document.body.removeChild(modal);
    };
    
    cancelButton.onclick = () => {
        document.body.removeChild(modal);
    };
    
    modal.onclick = (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    };

    input.onkeypress = (e) => {
        if (e.key === 'Enter') {
            renameButton.click();
        }
        if (e.key === 'Escape') {
            cancelButton.click();
        }
    };
    
    document.body.appendChild(modal);
    input.focus();
}

async function moveFolder(folderId, newParentId) {
    const result = await ipcRenderer.invoke('session-action', {
        action: 'move-folder',
        id: folderId,
        parentId: newParentId
    });
    
    if (result.success) {
        updateSessionsList(result.sessions);
    }
}

function showCreateFolderModal(parentId = null) {
    console.log('Showing create folder modal, parentId:', parentId);
    
    // Show sidebar when creating a new folder
    const sidebar = document.querySelector('.sidebar');
    sidebar.classList.remove('collapsed');
    document.getElementById('toggleSessions').style.opacity = '1';
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Create New ${parentId ? 'Subfolder' : 'Folder'}</h3>
            <input type="text" class="modal-input" placeholder="Enter folder name" autofocus>
            <div class="modal-actions">
                <button class="primary-button">Create</button>
                <button class="secondary-button">Cancel</button>
            </div>
        </div>
    `;
    
    const input = modal.querySelector('input');
    const createButton = modal.querySelector('.primary-button');
    const cancelButton = modal.querySelector('.secondary-button');
    
    createButton.onclick = async () => {
        const name = input.value.trim();
        console.log('Create button clicked, folder name:', name);
        if (name) {
            await createFolder(name, parentId);
            document.body.removeChild(modal);
        }
    };
    
    cancelButton.onclick = () => {
        console.log('Cancel button clicked');
        document.body.removeChild(modal);
    };
    
    modal.onclick = (e) => {
        if (e.target === modal) {
            console.log('Modal background clicked');
            document.body.removeChild(modal);
        }
    };

    input.onkeypress = (e) => {
        if (e.key === 'Enter') {
            console.log('Enter key pressed in input');
            createButton.click();
        }
        if (e.key === 'Escape') {
            console.log('Escape key pressed in input');
            cancelButton.click();
        }
    };
    
    document.body.appendChild(modal);
    input.focus();
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

    if (!activeSessionId) {
        const notification = document.createElement('div');
        notification.className = 'update-notification';
        notification.innerHTML = 'Please create or select a session first';
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
        return;
    }

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
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
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

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('=== DOM Content Loaded ===');
    
    // Verify sessionsList exists
    const sessionsList = document.getElementById('sessionsList');
    if (!sessionsList) {
        console.error('sessionsList element not found!');
        return;
    }
    console.log('sessionsList element found:', sessionsList);
    
    // Set up IPC listeners
    console.log('Setting up IPC listeners');
    ipcRenderer.on('trigger-insert-last-response', () => {
        console.log('=== Received trigger-insert-last-response from main process ===');
        console.log('Active session:', activeSessionId);
        console.log('Session viewer:', document.querySelector('.session-viewer'));
        insertLastResponse();
    });

    ipcRenderer.on('trigger-save-notes', async () => {
        console.log('=== Received trigger-save-notes from main process ===');
        if (!activeSessionId) return;

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

    // Load initial sessions
    console.log('Loading initial sessions...');
    ipcRenderer.invoke('get-sessions')
        .then(result => {
            console.log('Initial sessions loaded:', JSON.stringify(result, null, 2));
            if (result.success) {
                updateSessionsList(result.sessions);
            }
        })
        .catch(error => {
            console.error('Error loading initial sessions:', error);
        });
        
    // Ensure sidebar starts collapsed
    const sidebar = document.querySelector('.sidebar');
    sidebar.classList.add('collapsed');
    document.getElementById('toggleSessions').style.opacity = '0.7';
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
        // Refresh sessions list when sidebar is opened
        ipcRenderer.invoke('get-sessions')
            .then(result => {
                if (result.success) {
                    updateSessionsList(result.sessions);
                }
            })
            .catch(error => {
                console.error('Error refreshing sessions:', error);
            });
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