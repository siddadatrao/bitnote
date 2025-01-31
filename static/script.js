const promptInput = document.getElementById('promptInput');
const sendButton = document.getElementById('sendButton');
const refreshButton = document.getElementById('refreshButton');
const responseDiv = document.getElementById('response');

async function sendPrompt() {
    const prompt = promptInput.value.trim();
    if (!prompt) return;

    try {
        const response = await fetch('/api/prompt', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ prompt }),
        });

        const data = await response.json();
        
        if (data.success) {
            // Display full conversation history
            responseDiv.innerHTML = data.history;
            responseDiv.style.display = 'block';
            responseDiv.classList.remove('error');
            
            // Scroll to bottom of conversation
            responseDiv.scrollTop = responseDiv.scrollHeight;
        } else {
            responseDiv.textContent = `Error: ${data.error}`;
            responseDiv.style.display = 'block';
            responseDiv.classList.add('error');
        }

        promptInput.value = '';
        
    } catch (error) {
        responseDiv.textContent = `Error: ${error.message}`;
        responseDiv.style.display = 'block';
        responseDiv.classList.add('error');
    }
}

async function refreshMemory() {
    try {
        const response = await fetch('/api/refresh', {
            method: 'POST',
        });

        const data = await response.json();
        
        if (data.success) {
            responseDiv.textContent = "Memory cleared";
            responseDiv.style.display = 'block';
            responseDiv.classList.remove('error');
            setTimeout(() => {
                responseDiv.style.display = 'none';
            }, 2000);
        }
    } catch (error) {
        responseDiv.textContent = `Error: ${error.message}`;
        responseDiv.style.display = 'block';
        responseDiv.classList.add('error');
    }
}

sendButton.addEventListener('click', sendPrompt);
refreshButton.addEventListener('click', refreshMemory);
promptInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendPrompt();
    }
}); 