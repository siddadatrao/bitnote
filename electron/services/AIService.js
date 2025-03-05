const axios = require('axios');

class AIService {
    constructor() {
        this.conversationHistory = [];
        this.lastSummarizedIndex = -1;  // Track the last summarized message index
        this.apiUrl = 'https://bitnote-a97b19c0e48d.herokuapp.com/response_router';
        this.MAX_CONTEXT_MESSAGES = 10; // Keep last 10 messages for context
        
        // Common instructions for summary formatting
        this.summaryInstructions = `Rules:
1. Look to keep existing headings unless there is a better way to organize the information.
2. Keep existing ideas and look to expand on them by integrating new information directly into the existing information under existing headings.
3. If new information is substantially different from existing ideas, add additional sections.
4. If a new structure makes sense, reformat the existing notes, we want to avoid creating too large of a note.
5. If possible, draw connections between new and existing information to maintain coherence.
6. Always wrap headings in proper HTML tags - never output raw text headings.
7. Start each section with <h2> tags, not plain text.

Format requirements:
- Every heading must be wrapped in <h2> tags.
- Use <ul>/<li> for lists.
- Use bullet points for lists of related items.
- If there are code examples, wrap them in <pre><code> tags.
- Use <p> tags for paragraphs.
- Add <br> for spacing where appropriate.
- Never output raw text headings without HTML tags.
- Keep formatting consistent throughout the document.`;
    }

    refreshMemory() {
        this.conversationHistory = [];
        this.lastSummarizedIndex = -1;  // Reset the last summarized index
    }

    loadConversationHistory(history) {
        this.conversationHistory = [...history];
        this.lastSummarizedIndex = -1;  // Reset summary index when loading new history
    }

    getConversationHistory() {
        return this.conversationHistory;
    }

    getRecentContext() {
        // Get the most recent messages within the context window
        return this.conversationHistory.slice(-this.MAX_CONTEXT_MESSAGES);
    }

    async processPrompt(prompt, useClipboard, clipboardContent, existingNotes) {
        try {
            const contextParts = [];

            // Add recent conversation history if available
            if (this.conversationHistory.length > 0) {
                const recentContext = this.getRecentContext();
                console.log(`Including last ${recentContext.length} messages from conversation history:`, recentContext);
                contextParts.push("Previous Conversation:\n" + recentContext.map(msg => 
                    `${msg.role.toUpperCase()}: ${msg.content}`
                ).join('\n'));
                
                if (this.conversationHistory.length > this.MAX_CONTEXT_MESSAGES) {
                    console.log(`Note: ${this.conversationHistory.length - this.MAX_CONTEXT_MESSAGES} older messages were omitted from context`);
                }
            } else {
                console.log('No previous conversation history available');
            }

            if (useClipboard && clipboardContent) {
                console.log('Including clipboard content');
                contextParts.push(`Clipboard Context:\n${clipboardContent}`);
            }

            if (existingNotes) {
                console.log('Including existing notes');
                contextParts.push(`Current Summary:\n${existingNotes}`);
            }

            contextParts.push(`Question: ${prompt}`);
            const fullPrompt = contextParts.join('\n\n');

            console.log('Full prompt being sent to API:', fullPrompt);

            const response = await axios.post(this.apiUrl, {
                role: "Maintain context from the previous conversation when responding. Keep responses concise and to the point unless asked a more thought provoking question.",
                prompt: fullPrompt
            }, {
                timeout: 60000,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Accept-Encoding': 'gzip, deflate, br'
                }
            });

            if (response.data && response.data.response) {
                this.conversationHistory.push(
                    { role: 'user', content: prompt },
                    { role: 'assistant', content: response.data.response }
                );
                return response.data.response;
            }
            throw new Error('Invalid response from API');
        } catch (error) {
            console.error('Error processing prompt:', error);
            throw error;
        }
    }

    async generateSummary(existingNotes = "") {
        try {
            // Get only the new messages since last summary
            const newMessages = this.conversationHistory.slice(this.lastSummarizedIndex + 1);
            
            if (newMessages.length === 0) {
                return { summary: existingNotes, noNewContent: true };
            }

            // Create a prompt for summarization
            const summaryPrompt = this.createSummaryPrompt(newMessages, existingNotes);

            const response = await axios.post(this.apiUrl, {
                role: "You are a note summarizer. Create clear, concise, and structured notes that only contain useful information and are to the point using HTML formatting for better readability.",
                prompt: summaryPrompt
            }, {
                timeout: 60000,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Accept-Encoding': 'gzip, deflate, br'
                }
            });

            if (response.data && response.data.response) {
                // Update the last summarized index
                this.lastSummarizedIndex = this.conversationHistory.length - 1;
                return { 
                    summary: response.data.response,
                    noNewContent: false
                };
            }
            throw new Error('Invalid response from API');
        } catch (error) {
            console.error('Error generating summary:', error);
            throw error;
        }
    }

    async insertLastResponse(existingNotes = "") {
        try {
            console.log('=== insertLastResponse called ===');
            console.log('Conversation history length:', this.conversationHistory.length);
            console.log('Full conversation history:', JSON.stringify(this.conversationHistory, null, 2));
            
            // Get the last response from conversation history
            const lastResponse = this.conversationHistory[this.conversationHistory.length - 1];
            console.log('Last response found:', lastResponse);
            
            if (!lastResponse || lastResponse.role !== 'assistant') {
                console.log('No valid assistant response found. LastResponse:', lastResponse);
                return { summary: existingNotes, noNewContent: true };
            }

            console.log('Valid assistant response found, creating summary prompt');
            const summaryPrompt = `Integrate this new information into the existing notes.

${this.summaryInstructions}

Existing Notes:
${existingNotes}

New Information to Insert:
${lastResponse.content}`;

            console.log('Making API request with prompt:', summaryPrompt);
            const response = await axios.post(this.apiUrl, {
                role: "You are a note summarizer. Create clear, concise, and structured notes that only contain useful information and are to the point using HTML formatting for better readability.",
                prompt: summaryPrompt
            }, {
                timeout: 60000,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Accept-Encoding': 'gzip, deflate, br'
                }
            });

            console.log('API response received:', response.data);
            if (response.data && response.data.response) {
                console.log('Returning successful summary');
                return { 
                    summary: response.data.response,
                    noNewContent: false
                };
            }
            console.log('Invalid API response:', response.data);
            throw new Error('Invalid response from API');
        } catch (error) {
            console.error('Error in insertLastResponse:', error);
            throw error;
        }
    }

    createSummaryPrompt(messages, existingNotes) {
        let prompt = `Integrate the existing notes with new information from this conversation.

${this.summaryInstructions}

${existingNotes ? `Existing Notes:\n${existingNotes}\n\n` : ''}New Conversation:\n`;

        messages.forEach(msg => {
            prompt += `\n${msg.role.toUpperCase()}: ${msg.content}\n`;
        });

        return prompt;
    }
}

module.exports = AIService; 