import sys
import json
import pyperclip
import os
from datetime import datetime
import asyncio
from threading import Thread
from concurrent.futures import ThreadPoolExecutor
import functools
import traceback
import re
import requests
import time  # Add this at the top with other imports

# At the top of the file with other global instances
executor = ThreadPoolExecutor(max_workers=4)
MAX_TOKENS = 4000  # Keep token limit for context management

# API endpoint
API_URL = "https://bitnote-a97b19c0e48d.herokuapp.com/response_router"

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
        print(f"\n=== Adding Interaction to Session {self.id} ===")
        self.conversations.append({
            "prompt": prompt,
            "response": response,
            "timestamp": datetime.now().isoformat()
        })
        
        # Simpler task management
        if self._summarization_task:
            print("Cancelling previous summarization task")
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
                    print(f"\n=== Notes Generation Result ===")
                    print(f"Type: {type(result)}")
                    print(f"Content: {result[:200]}...")  # Print first 200 chars
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
                    print("\n=== Sending Final Notes Update ===")
                    print(f"Response object: {json.dumps(response)[:200]}...")
                    sys.stdout.write(json.dumps(response) + '\n')
                    sys.stdout.flush()
                except Exception as e:
                    print(f"\n=== Error in Notes Generation Callback: {str(e)} ===")
                    print(f"Error in notes generation: {str(e)}")
                    traceback.print_exc()
            
            future.add_done_callback(done_callback)
            self._summarization_task = future
            
        except Exception as e:
            print(f"\n=== Error Starting Notes Generation: {str(e)} ===")
            print(f"Error starting notes generation: {str(e)}")
            traceback.print_exc()

    async def generate_notes_async(self):
        pre_existing_notes = ""
        try:
            conversation_text = ""
            
            print("\n=== Starting Notes Generation ===")
            if self.conversations and len(self.conversations) > 0:
                last_conversation = self.conversations[-1]
                last_conversation_prompt = last_conversation['prompt']
                last_conversation_response = last_conversation['response']
                
                if self.notes:
                    pre_existing_notes = self.notes
                    print(f"Using existing notes (length: {len(pre_existing_notes)})")

                    conversation_text += f"""
New conversation to incorporate into existing notes:
Q: {last_conversation_prompt}
A: {last_conversation_response}"""
                else:
                    print("No existing notes, creating initial notes")
                    pre_existing_notes = "No existing notes"
                    conversation_text = f"""Here is the conversation to create initial notes from:
Q: {last_conversation_prompt}
A: {last_conversation_response}"""
            else:
                print("No conversations to summarize")
                return "No conversations to summarize yet."

            params = {
                "role": "You are a not summarizer. Create clear, structured notes that only contain useful information and are to the point using HTML formatting for better readability.",
                "prompt": self.summary_prompt(conversation_text, pre_existing_notes)
            }

            print("\n=== Sending Summary Request ===")
            sys.stderr.write(f"Here is the summary prompt:\n{self.summary_prompt(conversation_text, pre_existing_notes)}\n")
            
            response = requests.get(
                API_URL,
                params=params,
                timeout=300,
                headers={'Connection': 'close'}
            )
            
            print(f"\n=== Got Response (status: {response.status_code}) ===")
            if response.status_code != 200:
                print(f"Error: Server returned status {response.status_code}")
                return f"Error: Server returned status {response.status_code}"
            
            response_data = response.json()
            response_content = response_data.get('response', 'No response received')
            
            print(f"\n=== Processing Response (length: {len(response_content)}) ===")
            sys.stderr.write(f"\nReceived summary response:\n{response_content}\n")
            sys.stderr.flush()
            
            print("\n=== Notes Generation Complete ===")
            return response_content
            
        except Exception as e:
            print(f"\n=== Error in Notes Generation: {str(e)} ===")
            sys.stderr.write(f"Error generating notes: {str(e)}\n")
            sys.stderr.flush()
            traceback.print_exc()
            return f"Error generating notes: {str(e)}"

    def summary_prompt(self, conversation_text, pre_existing_notes):
        return f"""Please update the existing notes with new information from this conversation. 

Rules:
1. If there are existing section headings, do not delete them.
2. Keep existing ideas and look to expand on them by integrating new informatino direcely into the existing inforation.
3. If new information is substantially different from existing ideas, add additional sections.
4. Add additional sections if new information is substantially different from existing ideas. If possible draw from the existing information and connect with it. 
5. Always wrap headings in proper HTML tags - never output raw text headings.
6. Start each section with <h2> tags, not plain text.

Format requirements:
- Every heading must be wrapped in <h2> tags.
- Use <ul>/<li> for lists.
- Use bullet points for lists of related items.
- If there are code examples, wrap them in <pre><code> tags.
- Use <p> tags for paragraphs.
- Add <br> for spacing where appropriate.
- Never output raw text headings without HTML tags.

Example format:
<h2>Concept Name</h2>
<ul>
<li>Point 1</li>
<li>Point 2</li>
</ul>

Existing Notes:
{pre_existing_notes}

New Information:
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
    sys.stderr.write("\n=== Starting chat prompt handler ===\n")
    
    try:
        # Setup the request with proper headers and timeout handling
        headers = {
            'Connection': 'keep-alive',
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip, deflate, br'
        }
        
        # Create a session for better connection handling
        with requests.Session() as session:
            session.mount('https://', requests.adapters.HTTPAdapter(
                max_retries=3,
                pool_connections=1,
                pool_maxsize=1
            ))
            
            # Prepare the prompt
            current_clipboard = pyperclip.paste()
            if current_clipboard != chat_manager.last_clipboard_content:
                full_prompt = f"Context:\n{current_clipboard}\n\nQuestion: {data['prompt']}"
                chat_manager.last_clipboard_content = current_clipboard
            else:
                full_prompt = data['prompt']
            
            # Make the API request
            params = {
                "role": "You are a helpful assistant",
                "prompt": full_prompt.strip()
            }
            
            sys.stderr.write("\n=== Making API Request ===\n")
            response = session.get(
                API_URL,
                params=params,
                headers=headers,
                timeout=60,  # Reduced timeout to avoid Heroku's 30s limit
                stream=True  # Enable streaming for large responses
            )
            
            if response.status_code != 200:
                sys.stderr.write(f"\nAPI Error: Status {response.status_code}\n")
                return {
                    'success': False,
                    'error': f'Server error (status {response.status_code})'
                }
            
            # Read the response in chunks to handle large responses better
            chunks = []
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    chunks.append(chunk)
            
            response_content = b''.join(chunks).decode('utf-8')
            
            try:
                response_data = json.loads(response_content)
                response_content = response_data.get('response', 'No response received')
            except json.JSONDecodeError:
                sys.stderr.write("\nWarning: Invalid JSON response\n")
                return {
                    'success': False,
                    'error': 'Invalid response format from server'
                }
            
            # Store the conversation
            chat_manager.conversation_history.append({"role": "user", "content": data['prompt']})
            chat_manager.conversation_history.append({"role": "assistant", "content": response_content})
            
            # Handle session updates
            session_id = data.get('sessionId')
            if session_id and session_id in session_manager.sessions:
                session = session_manager.sessions[session_id]
                print(f"Adding interaction to session {session_id}")
                session.add_interaction(data['prompt'], response_content)
                return {
                    'success': True,
                    'response': response_content,
                    'conversation_history': chat_manager.conversation_history,
                    'sessions': session_manager.serialize_sessions(),
                    'type': 'chat_response'
                }
            
            return {
                'success': True,
                'response': response_content,
                'conversation_history': chat_manager.conversation_history,
                'sessions': session_manager.serialize_sessions(),
                'type': 'chat_response'
            }
            
    except requests.exceptions.Timeout:
        sys.stderr.write("\nError: Request timed out\n")
        return {
            'success': False,
            'error': 'Request timed out. Please try again.'
        }
    except requests.exceptions.ConnectionError:
        sys.stderr.write("\nError: Connection failed\n")
        return {
            'success': False,
            'error': 'Could not connect to server. Please try again.'
        }
    except Exception as e:
        sys.stderr.write(f"\nUnexpected error: {str(e)}\n")
        traceback.print_exc()
        return {
            'success': False,
            'error': f'API error: {str(e)}'
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
    print(f"\n=== Loading Session {session_id} ===")
    if session_id in session_manager.sessions:
        session = session_manager.sessions[session_id]
        print(f"Found session: {session.name}")
        print(f"Notes length: {len(str(session.notes))}")
        print(f"Notes content: {session.notes[:200]}...")  # Print first 200 chars
        sys.stderr.write(f"Loading session {session_id}, notes length: {len(str(session.notes))}\n")
        response = {
            'success': True,
            'response': session.notes if session.notes else "No notes available yet",
            'sessionId': session_id,
            'sessions': session_manager.serialize_sessions()
        }
        print(f"Sending response: {json.dumps(response)[:200]}...")
        return response
    else:
        print(f"Session {session_id} not found!")
        return {
            'success': False,
            'error': f'Session {session_id} not found'
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
    required_packages = ['requests', 'pyperclip']
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
    try:
        main()
    except Exception as e:
        print("=== Fatal Error ===")
        print(f"Error: {str(e)}")
        traceback.print_exc()
        sys.stdout.flush()
        sys.exit(1) 