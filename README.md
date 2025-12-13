<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# AudioScribe FLUX

Professional audio transcription with intelligent self-correction using dual AI models.

## 🎯 Features

- **Large File Support**: Handles audio files up to 200MB using smart chunking (6MB chunks)
- **Dual AI Architecture**:
  - **Gemini Flash 2.5**: Fast audio transcription (粗写)
  - **DeepSeek Chat**: Intelligent polishing and consultation (精校)
- **Self-Correcting Agent**: Cognitive pipeline with perception, verification, consultation, and polishing phases
- **Voice Activity Detection**: Automatically skips silent segments
- **Audio Preprocessing**: Converts to optimal format (16kHz mono WAV)
- **Real-time Monitoring**: Visual cognitive board showing processing status

## 🚀 Run Locally

**Prerequisites:** Node.js 20+

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure API keys in [.env.local](.env.local):
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   DEEPSEEK_API_KEY=your_deepseek_api_key_here
   ```

3. Run the app:
   ```bash
   npm run dev
   ```

4. Open http://localhost:3000 in your browser

## 🏗️ Architecture

- **Transcription**: Gemini 2.5 Flash (fast, audio-native)
- **Polishing**: DeepSeek Chat (reasoning, text refinement)
- **Consultation**: DeepSeek Chat (error analysis, retry strategy)
