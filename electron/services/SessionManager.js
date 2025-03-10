const { app } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const { EventEmitter } = require('events');

class Folder {
    constructor(id, name, parentId = null) {
        this.id = id;
        this.name = name;
        this.parentId = parentId;
        this.created_at = new Date().toISOString();
    }
}

class Session {
    constructor(id, name, folderId = null) {
        this.id = id;
        this.name = name;
        this.conversations = [];
        this.notes = "";
        this.active = true;
        this.created_at = new Date().toISOString();
        this.folderId = folderId;
    }

    addInteraction(prompt, response) {
        this.conversations.push({
            prompt,
            response,
            timestamp: new Date().toISOString()
        });
    }
}

class SessionManager extends EventEmitter {
    constructor() {
        super();
        this.sessions = new Map();
        this.folders = new Map();
        this.activeSession = null;
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;
        
        try {
            // Get app data directory
            const appDataPath = this.getAppDataDir();
            await fs.mkdir(appDataPath, { recursive: true });
            
            this.sessionsFile = path.join(appDataPath, 'sessions.json');
            this.foldersFile = path.join(appDataPath, 'folders.json');
            await this.loadFolders();
            await this.loadSessions();
            this.initialized = true;
        } catch (error) {
            console.error('Error initializing SessionManager:', error);
            throw error;
        }
    }

    getAppDataDir() {
        const userDataPath = app.getPath('userData');
        return path.join(userDataPath, 'BitNote');
    }

    async loadFolders() {
        try {
            const exists = await fs.access(this.foldersFile)
                .then(() => true)
                .catch(() => false);

            if (!exists) {
                this.folders = new Map();
                return;
            }

            const data = await fs.readFile(this.foldersFile, 'utf-8');
            const foldersData = JSON.parse(data);

            this.folders = new Map(
                foldersData.map(folderData => {
                    const folder = new Folder(folderData.id, folderData.name, folderData.parentId);
                    folder.created_at = folderData.created_at;
                    return [folder.id, folder];
                })
            );

            console.log(`Loaded ${this.folders.size} folders`);
        } catch (error) {
            console.error('Error loading folders:', error);
            this.folders = new Map();
        }
    }

    async saveFolders() {
        try {
            console.log('SessionManager: Saving folders...');
            const foldersData = Array.from(this.folders.values()).map(folder => ({
                id: folder.id,
                name: folder.name,
                parentId: folder.parentId,
                created_at: folder.created_at
            }));

            console.log('SessionManager: Folders data to save:', foldersData);
            const tempFile = `${this.foldersFile}.tmp`;
            await fs.writeFile(tempFile, JSON.stringify(foldersData, null, 2), 'utf-8');
            await fs.rename(tempFile, this.foldersFile);

            console.log(`SessionManager: Saved ${this.folders.size} folders`);
        } catch (error) {
            console.error('SessionManager: Error saving folders:', error);
            throw error;
        }
    }

    async loadSessions() {
        try {
            const exists = await fs.access(this.sessionsFile)
                .then(() => true)
                .catch(() => false);

            if (!exists) {
                this.sessions = new Map();
                return;
            }

            const data = await fs.readFile(this.sessionsFile, 'utf-8');
            const sessionsData = JSON.parse(data);

            this.sessions = new Map(
                sessionsData.map(sessionData => {
                    const session = new Session(sessionData.id, sessionData.name, sessionData.folderId);
                    session.conversations = sessionData.conversations || [];
                    session.notes = sessionData.notes || "";
                    session.active = sessionData.active;
                    session.created_at = sessionData.created_at;
                    return [session.id, session];
                })
            );

            console.log(`Loaded ${this.sessions.size} sessions`);
        } catch (error) {
            console.error('Error loading sessions:', error);
            this.sessions = new Map();
        }
    }

    async saveSessions() {
        try {
            const sessionsData = Array.from(this.sessions.values()).map(session => ({
                id: session.id,
                name: session.name,
                conversations: session.conversations,
                notes: session.notes,
                active: session.active,
                created_at: session.created_at,
                folderId: session.folderId
            }));

            const tempFile = `${this.sessionsFile}.tmp`;
            await fs.writeFile(tempFile, JSON.stringify(sessionsData, null, 2), 'utf-8');
            await fs.rename(tempFile, this.sessionsFile);

            console.log(`Saved ${this.sessions.size} sessions`);
        } catch (error) {
            console.error('Error saving sessions:', error);
            throw error;
        }
    }

    createFolder(name, parentId = null) {
        console.log('SessionManager: Creating folder:', { name, parentId });
        const folderId = `folder_${new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').split('.')[0]}`;
        const folder = new Folder(folderId, name, parentId);
        this.folders.set(folderId, folder);
        console.log('SessionManager: Created folder:', folder);
        console.log('SessionManager: Current folders:', Array.from(this.folders.entries()));
        this.saveFolders();
        return folderId;
    }

    deleteFolder(folderId) {
        // Get all child folders recursively
        const childFolders = this.getChildFolders(folderId);
        
        // Move all sessions in this folder and child folders to root
        for (const session of this.sessions.values()) {
            if (session.folderId === folderId || childFolders.has(session.folderId)) {
                session.folderId = null;
            }
        }
        
        // Delete all child folders
        for (const childId of childFolders) {
            this.folders.delete(childId);
        }
        
        // Delete the folder itself
        const deleted = this.folders.delete(folderId);
        if (deleted) {
            this.saveFolders();
            this.saveSessions();
        }
        return deleted;
    }

    getChildFolders(folderId) {
        const children = new Set();
        for (const [id, folder] of this.folders) {
            if (folder.parentId === folderId) {
                children.add(id);
                // Recursively get children of this child
                const grandchildren = this.getChildFolders(id);
                for (const grandchildId of grandchildren) {
                    children.add(grandchildId);
                }
            }
        }
        return children;
    }

    moveFolder(folderId, newParentId) {
        const folder = this.folders.get(folderId);
        if (!folder) return false;

        // Check for circular reference
        if (newParentId) {
            let parent = this.folders.get(newParentId);
            while (parent) {
                if (parent.id === folderId) return false; // Would create a loop
                parent = this.folders.get(parent.parentId);
            }
        }

        folder.parentId = newParentId;
        this.saveFolders();
        return true;
    }

    renameFolder(folderId, newName) {
        const folder = this.folders.get(folderId);
        if (folder) {
            folder.name = newName;
            this.saveFolders();
            return true;
        }
        return false;
    }

    createSession(name, folderId = null) {
        console.log('Creating session:', name, 'in folder:', folderId);
        
        // Verify folder exists if specified
        if (folderId && !this.folders.has(folderId)) {
            console.log('Specified folder not found, creating session in root');
            folderId = null;
        }

        const sessionId = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').split('.')[0];
        const session = new Session(sessionId, name, folderId);
        this.sessions.set(sessionId, session);
        this.activeSession = sessionId;
        
        console.log('Session created:', {
            id: sessionId,
            name: name,
            folderId: folderId
        });
        
        this.saveSessions();
        return sessionId;
    }

    moveSession(sessionId, targetFolderId) {
        console.log('Moving session:', sessionId, 'to folder:', targetFolderId);
        const session = this.sessions.get(sessionId);
        
        // Verify session exists
        if (!session) {
            console.log('Session not found:', sessionId);
            return false;
        }

        // If targetFolderId is provided, verify the folder exists
        if (targetFolderId && !this.folders.has(targetFolderId)) {
            console.log('Target folder not found:', targetFolderId);
            return false;
        }

        // Update session's folder ID (null for root folder)
        session.folderId = targetFolderId;
        console.log('Session moved successfully. New folder:', targetFolderId);
        
        // Save changes
        this.saveSessions();
        return true;
    }

    serializeSessions() {
        console.log('SessionManager: Serializing sessions and folders');
        const serialized = {
            folders: {},
            sessions: {}
        };

        // Helper function to build folder tree and collect all folder IDs
        const buildFolderTree = (parentId = null) => {
            const folderTree = {};
            
            // Get direct children of current parent
            for (const [id, folder] of this.folders) {
                if (folder.parentId === parentId) {
                    folderTree[id] = {
                        id: folder.id,
                        name: folder.name,
                        created_at: folder.created_at,
                        parentId: folder.parentId,
                        children: buildFolderTree(folder.id),
                        sessions: []
                    };
                    // Add this folder to the flat structure
                    serialized.folders[id] = folderTree[id];
                }
            }
            
            return folderTree;
        };

        // Initialize root folder
        serialized.folders.root = {
            id: 'root',
            name: 'Root',
            children: {},
            sessions: []
        };

        // Build folder tree starting from root
        serialized.folders.root.children = buildFolderTree(null);

        // First pass: Add sessions to the serialized structure
        for (const [id, session] of this.sessions) {
            console.log('Processing session:', id, 'folderId:', session.folderId);
            
            const sessionData = {
                id: session.id,
                name: session.name,
                active: session.active,
                created_at: session.created_at,
                conversation_count: session.conversations.length,
                latest_prompt: session.conversations.length > 0 
                    ? session.conversations[session.conversations.length - 1].prompt 
                    : null,
                is_current: id === this.activeSession,
                folderId: session.folderId
            };

            // Set active state based on activeSession
            if (id === this.activeSession) {
                sessionData.active = true;
                sessionData.is_current = true;
            }

            serialized.sessions[id] = sessionData;
        }

        // Second pass: Assign sessions to their folders
        for (const [id, session] of this.sessions) {
            const folderId = session.folderId || 'root';
            console.log('Assigning session', id, 'to folder:', folderId);
            
            if (folderId === 'root') {
                serialized.folders.root.sessions.push(id);
            } else {
                // Check if the folder exists in our serialized structure
                const folder = serialized.folders[folderId];
                if (folder) {
                    folder.sessions.push(id);
                } else {
                    // If folder doesn't exist, move session to root
                    console.log('Folder not found, moving session to root:', folderId);
                    serialized.folders.root.sessions.push(id);
                    session.folderId = null;
                    this.saveSessions();
                }
            }
        }

        // Verify folder structure integrity
        for (const [id, folder] of Object.entries(serialized.folders)) {
            if (folder.parentId && !serialized.folders[folder.parentId]) {
                console.log('Parent folder not found for:', id, 'moving to root');
                folder.parentId = null;
                // Move the folder to root's children
                delete serialized.folders.root.children[id];
                serialized.folders.root.children[id] = folder;
            }
        }

        console.log('SessionManager: Final serialized data:', JSON.stringify(serialized, null, 2));
        return serialized;
    }

    endSession() {
        if (this.activeSession) {
            const session = this.sessions.get(this.activeSession);
            if (session) {
                session.active = false;
                this.activeSession = null;
                this.saveSessions();
            }
        }
    }

    deleteSession(sessionId) {
        const deleted = this.sessions.delete(sessionId);
        if (deleted && this.activeSession === sessionId) {
            this.activeSession = null;
        }
        this.saveSessions();
        return deleted;
    }

    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }

    updateSessionNotes(sessionId, notes) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.notes = notes;
            this.saveSessions();
            return true;
        }
        return false;
    }
}

module.exports = SessionManager; 