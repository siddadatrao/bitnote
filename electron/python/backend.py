import sys
import json
import openai
import pyperclip
import os
from datetime import datetime
import asyncio
from threading import Thread
from concurrent.futures import ThreadPoolExecutor
import functools
import traceback
import re

# At the top of the file with other global instances
executor = ThreadPoolExecutor(max_workers=4)

# Add these constants at the top of the file
MAX_TOKENS = 4000  # Conservative limit for context
SYSTEM_PROMPT = "You are a helpful assistant."

# Add these functions for key management
def save_api_key(key):
    """Save API key to a file"""
    try:
        data_dir = get_app_data_dir()
        if not os.path.exists(data_dir):
            os.makedirs(data_dir)
        key_file = os.path.join(data_dir, 'api_key.json')
        with open(key_file, 'w') as f:
            json.dump({'key': key}, f)
    except Exception as e:
        pass

def load_api_key():
    """Load API key from file"""
    try:
        data_dir = get_app_data_dir()  # Use same directory as sessions
        key_file = os.path.join(data_dir, 'api_key.json')
        sys.stderr.write(f"Looking for API key file at: {key_file}\n")
        
        if os.path.exists(key_file):
            with open(key_file, 'r') as f:
                data = json.load(f)
                key = data.get('key')
                if key:
                    sys.stderr.write(f"Successfully loaded API key: {key[:4]}...\n")
                    return key
                else:
                    sys.stderr.write("API key file exists but no key found\n")
    except Exception as e:
        sys.stderr.write(f"Error loading API key: {str(e)}\n")
        sys.stderr.flush()
    return None

# Initialize OpenAI key from file
def initialize_api_key():
    """Initialize API key from file or environment"""
    key = load_api_key()
    if key:
        openai.api_key = key
        sys.stderr.write(f"Loaded API key from file: {key[:4]}...\n")
        return True
    
    key = os.getenv('OPENAI_API_KEY')
    if key:
        openai.api_key = key
        sys.stderr.write("Loaded API key from environment\n")
        return True
    
    sys.stderr.write("No API key found\n")
    return False

class ChatManager:
    def __init__(self):
        self.conversation_history = []
        self.last_clipboard_content = None

class Session:
    def __init__(self, session_id, name):
        self.id = session_id
        self.name = name
        self.conversations = []
        self.notes = ""
        self.active = True
        self.created_at = datetime.now().isoformat()
        self._summarization_task = None
        self.loop = asyncio.new_event_loop()
        self.summarization_thread = Thread(target=self._run_event_loop, daemon=True)
        self.summarization_thread.start()

    def _run_event_loop(self):
        asyncio.set_event_loop(self.loop)
        self.loop.run_forever()

    def add_interaction(self, prompt, response):
        self.conversations.append({
            "prompt": prompt,
            "response": response,
            "timestamp": datetime.now().isoformat()
        })
        
        # Simpler task management
        if self._summarization_task:
            self._summarization_task.cancel()
        
        print("About to run coroutine")
        try:
            # Run the coroutine and add callbacks
            future = asyncio.run_coroutine_threadsafe(
                self.generate_notes_async(), 
                self.loop
            )
            
            def done_callback(fut):
                try:
                    result = fut.result()
                    print(f"Notes generation complete: {result[:100]}...")
                    self.notes = result
                    session_manager.save_sessions()
                    # Send the updated notes immediately with a specific type
                    response = {
                        'success': True,
                        'response': result,
                        'sessions': session_manager.serialize_sessions(),
                        'type': 'notes_update',  # Add this to identify note updates
                        'sessionId': self.id
                    }
                    sys.stdout.write(json.dumps(response) + '\n')
                    sys.stdout.flush()
                except Exception as e:
                    print(f"Error in notes generation: {str(e)}")
            
            future.add_done_callback(done_callback)
            self._summarization_task = future
            
        except Exception as e:
            print(f"Error starting notes generation: {str(e)}")

    async def generate_notes_async(self):
        try:
            print(f"Generating notes for session {self.id}")
            # Use only last interaction plus summary text to update the notes.
            if self.conversations and len(self.conversations) > 0:
                last_conversation = self.conversations[-1]
                last_conversation_prompt = last_conversation['prompt']
                last_conversation_response = last_conversation['response']
                
                if self.notes:  # If we have existing notes
                    summary_prompt = f"Here is the last conversation I had:\nQ: {last_conversation_prompt}\n\nA: {last_conversation_response}\n\nHere are the current learning notes:\n{self.notes}\n\nPlease update these notes with any new information from the last conversation while maintaining the same structure."
                else:  # If this is the first note
                    summary_prompt = f"Here is the conversation:\nQ: {last_conversation_prompt}\n\nA: {last_conversation_response}\n\nPlease create initial learning notes from this conversation."
            else:
                return "No conversations to summarize yet."

            # Use global executor instead of self.executor
            response = await self.loop.run_in_executor(
                executor,  # Use module-level executor
                functools.partial(
                    openai.chat.completions.create,
                    model="gpt-4",
                    messages=[
                        {"role": "system", "content": "You are a technical documenter. Create clear, structured notes using HTML formatting for better readability."},
                        {"role": "user", "content": self.summary_prompt(summary_prompt)}
                    ]
                )
            )
            
            return response.choices[0].message.content
        except Exception as e:
            sys.stderr.write(f"Error generating notes: {str(e)}\n")
            sys.stderr.flush()
            return None

    def summary_prompt(self, conversation_text):
        # First, check if there are existing headings in the notes
        existing_headings = ""
        if self.notes and "<h2>" in self.notes:
            # Extract existing headings
            headings = re.findall(r'<h2>(.*?)</h2>', self.notes)
            if headings:
                existing_headings = "Existing sections to maintain:\n" + "\n".join(f"- {h}" for h in headings)

        return f"""Please create notes of this conversation. We only care about the notes not any commentary. 

Important:
Maintain a structure that resembles note taking. Create headings if they seem like a new or separate idea. Look to add 
content to existing sections first. If there are no headings, you should organize information into partitions that make it easy to read. 

Rules:
1. If there are existing section headings, do not delete them.
2. Add new sections if content seems to be additive to a new idea.
3. Always wrap headings in proper HTML tags - never output raw text headings
4. Start each section with <h2> tags, not plain text

Format requirements:
- Every heading must be wrapped in <h2> tags
- Use <ul>/<li> for lists
- Use bullet points for lists of related items
- If there are code examples, wrap them in <pre><code> tags
- Use <p> tags for paragraphs
- Add <br> for spacing where appropriate
- Never output raw text headings without HTML tags

Example format:
<h2>Concept Name</h2>
<ul>
<li>Point 1</li>
<li>Point 2</li>
</ul>

{conversation_text}"""

    def __del__(self):
        """Cleanup when session is deleted"""
        if hasattr(self, 'loop') and self.loop.is_running():
            self.loop.call_soon_threadsafe(self.loop.stop)

def get_app_data_dir():
    """Get the appropriate app data directory for the current platform"""
    app_data_path = os.environ.get('APP_DATA_PATH')
    if app_data_path:
        return app_data_path
    else:
        return os.path.join(os.path.expanduser('~'), 'BitNote')

class SessionManager:
    def __init__(self):
        self.sessions = {}
        self.active_session = None
        
        # Use proper app data directory
        self.data_dir = get_app_data_dir()
        print(f"Using data directory: {self.data_dir}")
        
        # Create directory if it doesn't exist
        if not os.path.exists(self.data_dir):
            os.makedirs(self.data_dir)
            
        self.sessions_file = os.path.join(self.data_dir, 'sessions.json')
        self.load_sessions()

    def load_sessions(self):
        """Load sessions from JSON file"""
        try:
            if os.path.exists(self.sessions_file):
                with open(self.sessions_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    for session_data in data:
                        session = Session(session_data['id'], session_data['name'])
                        session.conversations = session_data.get('conversations', [])
                        session.notes = session_data.get('notes', "")
                        session.active = session_data.get('active', True)
                        session.created_at = session_data.get('created_at', datetime.now().isoformat())
                        self.sessions[session.id] = session
                print(f"Loaded {len(self.sessions)} sessions")
        except Exception as e:
            print(f"Error loading sessions: {str(e)}")
            # Start with empty sessions if file can't be loaded
            self.sessions = {}

    def save_sessions(self):
        """Save sessions to JSON file"""
        try:
            data = []
            for session in self.sessions.values():
                data.append({
                    'id': session.id,
                    'name': session.name,
                    'conversations': session.conversations,
                    'notes': session.notes,
                    'active': session.active,
                    'created_at': session.created_at
                })
            
            # Write to a temporary file first
            temp_file = self.sessions_file + '.tmp'
            with open(temp_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            
            # Then rename it to the actual file (atomic operation)
            if os.path.exists(self.sessions_file):
                os.remove(self.sessions_file)
            os.rename(temp_file, self.sessions_file)
            
            print(f"Saved {len(self.sessions)} sessions")
        except Exception as e:
            print(f"Error saving sessions: {str(e)}")
            import traceback
            traceback.print_exc()

    def create_session(self, name=None):
        """Create a new session"""
        try:
            session_id = datetime.now().strftime('%Y%m%d_%H%M%S')
            session_name = name or f"Session {session_id}"
            print(f"Creating session: {session_name} ({session_id})")
            
            session = Session(session_id, session_name)
            self.sessions[session_id] = session
            self.active_session = session_id
            
            self.save_sessions()
            return session_id
        except Exception as e:
            print(f"Error creating session: {str(e)}")
            import traceback
            traceback.print_exc()
            return None

    def end_session(self):
        if self.active_session:
            self.sessions[self.active_session].active = False
            self.active_session = None
            self.save_sessions()

    def delete_session(self, session_id):
        if session_id in self.sessions:
            del self.sessions[session_id]
            if self.active_session == session_id:
                self.active_session = None
            self.save_sessions()
            return True
        return False

    def serialize_sessions(self):
        """Convert sessions to a minimal JSON-serializable format"""
        serialized = {}
        for sid, session in self.sessions.items():
            serialized[sid] = {
                'id': session.id,
                'name': session.name,
                'active': session.active,
                'created_at': session.created_at,
                'conversation_count': len(session.conversations),
                'latest_prompt': (session.conversations[-1]['prompt'] 
                                if session.conversations else None),
                'is_current': sid == self.active_session
            }
        print(f"Serialized {len(serialized)} sessions")
        return serialized

# Create instances at the module level
chat_manager = ChatManager()
session_manager = SessionManager()

def count_tokens(text):
    """Rough estimation of token count - approximately 4 chars per token"""
    return len(text) // 4

def process_prompt(data):
    try:
        command = data.get('command', 'send-prompt')
        handlers = {
            'send-prompt': handle_chat_prompt,
            'start-session': handle_start_session,
            'refresh-memory': handle_refresh_memory,
            'end-session': handle_end_session,
            'load-session': handle_load_session,
            'delete-session': handle_delete_session,
            'get-sessions': handle_get_sessions,
            'set-api-key': handle_set_api_key,
            'check-api-key': handle_check_api_key,
            'update-notes': handle_update_notes
        }
        
        handler = handlers.get(command)
        if not handler:
            return {'success': False, 'error': 'Invalid command'}
            
        return handler(data)
        
    except Exception as e:
        return {'success': False, 'error': str(e)}

def handle_chat_prompt(data):
    """Handle prompt processing with copied text"""
    if not openai.api_key:
        return {
            'success': False,
            'error': 'API key not set'
        }
    
    full_prompt = data['prompt']
    
    # Only use clipboard if explicitly enabled
    if data.get('useClipboard', True):  # Default to True for backward compatibility
        current_clipboard = pyperclip.paste()
        if current_clipboard and current_clipboard != chat_manager.last_clipboard_content:
            full_prompt = f"Context:\n{current_clipboard}\n\nQuestion: {data['prompt']}"
            chat_manager.last_clipboard_content = current_clipboard

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT}
    ]
    
    # Calculate tokens used by system prompt and current prompt
    total_tokens = count_tokens(SYSTEM_PROMPT) + count_tokens(full_prompt)
    
    # Add conversation history from newest to oldest until we hit token limit
    temp_history = []
    for conv in reversed(chat_manager.conversation_history):
        tokens = count_tokens(conv["content"])
        if total_tokens + tokens > MAX_TOKENS:
            break
        temp_history.insert(0, conv)
        total_tokens += tokens
    
    messages.extend(temp_history)
    messages.append({"role": "user", "content": full_prompt})
    
    try:
        response = openai.chat.completions.create(
            model="gpt-4",
            messages=messages
        )
        
        response_content = response.choices[0].message.content
        
        # Store the conversation
        chat_manager.conversation_history.append({"role": "user", "content": full_prompt})
        chat_manager.conversation_history.append({"role": "assistant", "content": response_content})
        
        # Trim conversation history if it gets too long
        while count_tokens(' '.join(m["content"] for m in chat_manager.conversation_history)) > MAX_TOKENS * 2:
            chat_manager.conversation_history.pop(0)
            chat_manager.conversation_history.pop(0)  # Remove pairs of messages
        
        print(f"Checking session exists")
        # Add to session if one is selected
        session_id = data.get('sessionId')
        if session_id and session_id in session_manager.sessions:
            session = session_manager.sessions[session_id]
            print(f"Adding interaction to session {session_id}")
            session.add_interaction(data['prompt'], response_content)
        
        return {
            'success': True,
            'response': response_content,
            'sessions': session_manager.serialize_sessions()
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': f'OpenAI API error: {str(e)}'
        }

def handle_start_session(data):
    sys.stderr.write(f"Creating new session with name: {data['name']}\n")
    sys.stderr.flush()
    
    if not data['name']:
        return {
            'success': False,
            'error': 'Session name is required'
        }
    session_id = session_manager.create_session(data['name'])
    return {
        'success': True,
        'sessions': session_manager.serialize_sessions()
    }

def handle_refresh_memory(data):
    chat_manager.conversation_history = []
    chat_manager.last_clipboard_content = None
    return {
        'success': True,
        'sessions': session_manager.serialize_sessions()
    }

def handle_end_session(data):
    session_manager.end_session()
    return {
        'success': True,
        'sessions': session_manager.serialize_sessions()
    }

def handle_load_session(data):
    session_id = data['id']
    if session_id in session_manager.sessions:
        session = session_manager.sessions[session_id]
        sys.stderr.write(f"Loading session {session_id}, notes length: {len(str(session.notes))}\n")
        return {
            'success': True,
            'response': session.notes if session.notes else "No notes available yet",
            'sessions': session_manager.serialize_sessions()
        }

def handle_delete_session(data):
    session_id = data['id']
    success = session_manager.delete_session(session_id)
    return {
        'success': success,
        'sessions': session_manager.serialize_sessions()
    }

def handle_get_sessions(data):
    return {
        'success': True,
        'sessions': session_manager.serialize_sessions()
    }

def handle_set_api_key(data):
    """Handle setting the OpenAI API key"""
    global openai
    key = data.get('key')
    if key:
        openai.api_key = key
        save_api_key(key)
        return {
            'success': True
        }
    return {
        'success': False,
        'error': 'Invalid API key'
    }

def handle_check_api_key(data):
    """Check if API key exists"""
    key_exists = bool(openai.api_key)
    sys.stderr.write(f"Checking API key: {'exists' if key_exists else 'not found'}\n")
    return {
        'success': True,
        'hasKey': key_exists
    }

def handle_update_notes(data):
    """Handle updating session notes"""
    session_id = data.get('sessionId')
    notes = data.get('notes')
    
    if session_id and notes and session_id in session_manager.sessions:
        session = session_manager.sessions[session_id]
        session.notes = notes
        session_manager.save_sessions()
        return {
            'success': True,
            'sessions': session_manager.serialize_sessions()
        }
    return {
        'success': False,
        'error': 'Invalid session or notes data'
    }

def check_dependencies():
    """Check if all required packages are installed"""
    required_packages = ['openai', 'pyperclip']
    missing_packages = []
    
    for package in required_packages:
        try:
            __import__(package)
        except ImportError:
            missing_packages.append(package)
    
    if missing_packages:
        print(f"Missing required packages: {', '.join(missing_packages)}")
        print("Please install using: pip install " + " ".join(missing_packages))
        sys.exit(1)

# Check dependencies at startup
check_dependencies()

def main():
    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break
                
            data = json.loads(line)
            result = process_prompt(data)
            sys.stdout.write(json.dumps(result) + '\n')
            sys.stdout.flush()
            
        except Exception as e:
            error_result = {
                'success': False,
                'error': str(e)
            }
            sys.stdout.write(json.dumps(error_result) + '\n')
            sys.stdout.flush()

if __name__ == "__main__":
    try:        # Initialize the API key first
        initialize_api_key()
        # Then start the main loop
        main()
    except Exception as e:
        print("=== Fatal Error ===")
        print(f"Error: {str(e)}")
        traceback.print_exc()
        sys.stdout.flush()
        sys.exit(1) 