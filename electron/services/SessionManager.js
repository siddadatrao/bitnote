const { app } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const { EventEmitter } = require('events');

class Session {
    constructor(id, name) {
        this.id = id;
        this.name = name;
        this.conversations = [];
        this.notes = "";
        this.active = true;
        this.created_at = new Date().toISOString();
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
                    const session = new Session(sessionData.id, sessionData.name);
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
                created_at: session.created_at
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

    createSession(name) {
        const sessionId = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').split('.')[0];
        const session = new Session(sessionId, name);
        this.sessions.set(sessionId, session);
        this.activeSession = sessionId;
        this.saveSessions();
        return sessionId;
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

    serializeSessions() {
        const serialized = {};
        for (const [id, session] of this.sessions) {
            serialized[id] = {
                id: session.id,
                name: session.name,
                active: session.active,
                created_at: session.created_at,
                conversation_count: session.conversations.length,
                latest_prompt: session.conversations.length > 0 
                    ? session.conversations[session.conversations.length - 1].prompt 
                    : null,
                is_current: id === this.activeSession
            };
        }
        return serialized;
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