<div align="center">

```
██████╗  █████╗ ██╗    ██╗    ███████╗ ██████╗  ██████╗██╗   ██╗███████╗
██╔══██╗██╔══██╗██║    ██║    ██╔════╝██╔═══██╗██╔════╝██║   ██║██╔════╝
██████╔╝███████║██║ █╗ ██║    █████╗  ██║   ██║██║     ██║   ██║███████╗
██╔══██╗██╔══██║██║███╗██║    ██╔══╝  ██║   ██║██║     ██║   ██║╚════██║
██║  ██║██║  ██║╚███╔███╔╝    ██║     ╚██████╔╝╚██████╗╚██████╔╝███████║
╚═╝  ╚═╝╚═╝  ╚═╝ ╚══╝╚══╝     ╚═╝      ╚═════╝  ╚═════╝ ╚═════╝ ╚══════╝
```

**Your offline-first digital wellness companion.**  
Track screen time, chat with a local AI, and remember what matters — all on your machine.

[![Electron](https://img.shields.io/badge/Electron-2B2E3A?style=flat-square&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-0F172A?style=flat-square&logo=tailwindcss&logoColor=38BDF8)](https://tailwindcss.com/)
[![Ollama](https://img.shields.io/badge/Ollama-local%20AI-black?style=flat-square)](https://ollama.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

</div>

---

## What is RAW Focus?

RAW Focus is a **privacy-first desktop app** that watches how you spend your time on a PC, lets you chat with a local AI about your habits, and builds a personal memory bank — automatically. No cloud. No subscriptions. No data leaving your machine.

---

## Features

### 🕒 Screentime Tracking
- Built-in active window tracker — works from the moment your PC starts
- Tracks app usage every 10 seconds with near-zero CPU overhead
- Pauses automatically when screen is locked or system is idle
- Falls back to [ActivityWatch](https://activitywatch.net/) if you have it installed
- Live tray icon showing today's total at a glance
- 30-day daily averages with today vs monthly comparison

### 🤖 AI Chat — on demand, not always on
- AI only runs when **you ask for it** — no background inference, no GPU drain
- Uses [Ollama](https://ollama.com/) locally by default (fully offline)
- Supports external OpenAI-compatible APIs as an alternative
- Context-aware: the AI sees your real screentime and memories before answering
- Classifies apps automatically: gaming, browsing, communication, productive work
- Gives honest wellness feedback based on healthy daily usage benchmarks

### 🧠 Memory Bank
- Auto-extracts important facts from your conversations (exams, deadlines, goals)
- Manual memory entry with category tagging: exam / class / reminder / note
- Memories are injected into every AI conversation automatically
- Stored as a plain local JSON file — readable, portable, yours

### 💬 Chat History
- Multiple named chat sessions
- All conversations saved locally and automatically
- Switch between sessions without losing context

### 🖥️ Tray-first Design
- Dashboard window is optional — close it and the tracker keeps running silently
- Right-click tray menu: Open Dashboard / Hide / Quit
- Starts with Windows silently on boot (no window, just the tray icon)

---

## Quick Start

### Prerequisites

| Tool | Required | Purpose |
|------|----------|---------|
| [Node.js v18+](https://nodejs.org/) | ✅ Yes | Run the app |
| [Ollama](https://ollama.com/) | ✅ Yes (for AI) | Local AI inference |
| [ActivityWatch](https://activitywatch.net/) | ❌ Optional | Better screentime source |

### Installation

```bash
# 1. Clone the repo
git clone https://github.com/yourusername/raw-focus.git
cd raw-focus

# 2. Install dependencies
npm install

# 3. Pull a recommended AI model (pick one based on your GPU VRAM)
ollama pull mistral:7b-instruct-q4_K_M   # ~4GB VRAM — best quality
ollama pull phi3:mini                     # ~2.3GB VRAM — fast and light
ollama pull gemma2:2b                     # ~1.8GB VRAM — lowest footprint

# 4. Configure your environment
cp .env.example .env
# Edit .env with your preferred model and settings

# 5. Start the app
npm start
```

---

## Configuration

Create a `.env` file in the project root:

```env
# ─── AI Provider ───────────────────────────────────────────
# 'ollama' for local AI  |  'external' for cloud API
AI_PROVIDER=ollama

# ─── Ollama (local) ────────────────────────────────────────
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=mistral:7b-instruct-q4_K_M

# ─── External Cloud API (optional) ─────────────────────────
# EXTERNAL_API_URL=https://api.openai.com/v1/chat/completions
# EXTERNAL_API_KEY=sk-your-key-here
# EXTERNAL_MODEL=gpt-4o

# ─── ActivityWatch (optional) ──────────────────────────────
ACTIVITYWATCH_BASE_URL=http://localhost:5600

# ─── Dev Server ────────────────────────────────────────────
VITE_DEV_SERVER_URL=http://localhost:5173
```

### Model recommendations by GPU VRAM

| VRAM | Recommended model | Command |
|------|------------------|---------|
| 2 GB | `gemma2:2b` | `ollama pull gemma2:2b` |
| 3 GB | `phi3:mini` | `ollama pull phi3:mini` |
| 4 GB | `mistral:7b-instruct-q4_K_M` | `ollama pull mistral:7b-instruct-q4_K_M` |
| 6 GB+ | `llama3:8b` | `ollama pull llama3` |

---

## Scripts

```bash
npm start          # Start Vite + Electron together (recommended)
npm run dev        # Vite dev server only
npm run electron   # Electron only (use alongside npm run dev)
npm run build      # Production build
npm run lint       # ESLint check
```

---

## Architecture

```
raw-focus/
├── main.cjs              # Electron main process
│   ├── Screentime tracker (active-win polling, 10s interval)
│   ├── ActivityWatch fallback fetcher
│   ├── Ollama / external AI proxy
│   ├── Memories file I/O (memories.json)
│   └── System tray + window manager
│
├── preload.cjs           # Electron IPC bridge
│
└── src/
    └── App.jsx           # React UI
        ├── Screentime dashboard + bar chart
        ├── AI chat interface
        ├── Memory sidebar (auto + manual)
        └── Chat history manager
```

**All data is stored locally** in your OS user data directory — never sent anywhere.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `window.electronAPI is undefined` | You opened Vite in a browser. Use `npm start` instead |
| Port 5173 already in use | `netstat -ano \| findstr :5173` → `taskkill /F /PID <number>` |
| Ollama not responding | Run `ollama serve` in a terminal first |
| No screentime data showing | Check ActivityWatch is running at `localhost:5600`, or let the built-in tracker collect data for a few minutes |
| GPU cache warnings in terminal | Harmless — ignore them |
| Permission errors on window tracking | Run your terminal or IDE as administrator |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron |
| UI | React + Vite |
| Styling | TailwindCSS |
| Charts | Recharts |
| Icons | Lucide React |
| Window tracking | active-win |
| Local AI | Ollama |
| Screentime source | Built-in tracker + ActivityWatch fallback |

---

## Privacy

RAW Focus is built around one principle: **your data is yours.**

- All screentime logs, memories, and chat history are stored as plain files on your machine
- The built-in AI runs entirely locally via Ollama — no internet required
- No analytics, no telemetry, no accounts
- You can read, edit, or delete your data files at any time

---

## Contributing

PRs and issues welcome. If you find a bug or want a feature, open an issue and describe it clearly.

---

## License

MIT — do whatever you want with it.

---

<div align="center">
  <sub>Built for people who want to own their own attention.</sub>
</div>