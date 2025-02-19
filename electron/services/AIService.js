const axios = require('axios');

const API_URL = "https://bitnote-a97b19c0e48d.herokuapp.com/response_router";

class AIService {
    constructor() {
        this.conversationHistory = [];
        this.lastClipboardContent = null;
    }

    async processPrompt(prompt, useClipboard = false, clipboardContent = null, existingNotes = "") {
        try {
            const contextParts = [];

            if (useClipboard && clipboardContent && clipboardContent !== this.lastClipboardContent) {
                contextParts.push(`Clipboard Context:\n${clipboardContent}`);
                this.lastClipboardContent = clipboardContent;
            }

            if (existingNotes) {
                contextParts.push(`Current Summary:\n${existingNotes}`);
            }

            contextParts.push(`Question: ${prompt}`);
            const fullPrompt = contextParts.join('\n\n');

            const params = {
                role: "You are a helpful assistant.",
                prompt: fullPrompt
            };

            const response = await axios.get(API_URL, { 
                params,
                timeout: 60000,
                headers: {
                    'Connection': 'keep-alive',
                    'Accept': 'application/json',
                    'Accept-Encoding': 'gzip, deflate, br'
                }
            });

            if (response.status !== 200) {
                throw new Error(`Server returned status ${response.status}`);
            }

            const responseContent = response.data.response;
            
            this.conversationHistory.push(
                { role: "user", content: prompt },
                { role: "assistant", content: responseContent }
            );

            return responseContent;
        } catch (error) {
            console.error('Error processing prompt:', error);
            throw error;
        }
    }

    async generateNotes(conversation, existingNotes = "") {
        try {
            const prompt = this.createSummaryPrompt(conversation, existingNotes);

            const params = {
                role: "You are a note summarizer. Create clear, structured notes that only contain useful information and are to the point using HTML formatting for better readability.",
                prompt: prompt
            };

            const response = await axios.get(API_URL, {
                params,
                timeout: 60000,
                headers: {
                    'Connection': 'keep-alive',
                    'Accept': 'application/json',
                    'Accept-Encoding': 'gzip, deflate, br'
                }
            });

            if (response.status !== 200) {
                throw new Error(`Server returned status ${response.status}`);
            }

            return response.data.response;
        } catch (error) {
            console.error('Error generating notes:', error);
            throw error;
        }
    }

    createSummaryPrompt(conversation, existingNotes) {
        return `Please update the existing notes with new information from this conversation. 

Rules:
1. If there are existing section headings, do not delete them.
2. Keep existing ideas and look to expand on them by integrating new information directly into the existing information.
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

Existing Notes:
${existingNotes}

New Information:
Q: ${conversation.prompt}
A: ${conversation.response}`;
    }

    refreshMemory() {
        this.conversationHistory = [];
        this.lastClipboardContent = null;
    }

    getConversationHistory() {
        return this.conversationHistory;
    }
}

module.exports = AIService; 