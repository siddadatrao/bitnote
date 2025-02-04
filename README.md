# BitNote

A desktop application that helps you take notes of your conversation with llms. 

Access here: https://bitnoteui.fly.dev


## Features

### Core Functionality
- Use alongside interacting with online or any other learnable content
- Use ctrl+c to copy content to clipboard and the chat will use it as context
- As you chat, the application will continue to update the notes based on your chat

## Getting Started

1. Clone the repository
2. Install dependencies:
```
npm install
```
3. Start the application:
```
npm run dev
```
4. Enter your OpenAI API key when prompted (it will be saved for future use)

## Use Cases

### Workflow
- Use ctrl+c to copy content to clipboard and then type your question
- If you want to actively save to notes, either create a new note using the plus button or click on an existing note
- If you want the current chat history to be refreshed, click the refresh button
- To delet a note click the trash button on a session 

## Technical Details
- Built with Electron and Python
- Uses OpenAI's GPT-4 API
- Implements token limiting for optimal context management
- Asynchronous session note generation

## Disclaimer
- Not optimized to limit openai api usage so please be mindful
- Not optimized for performance so it may be slow as most code is developed by ai
- Not optimized for security so please be mindful of your api key
- This is a proof of concept and will be improved at some point

## Requirements

- Node.js
- Python 3.x
- OpenAI API key

## License

MIT License
