# ⚙️ MoldWatch AI

**AI-powered injection molding process monitor — React + Claude API**

Built by a 17-year injection molding process technician who decided to make the machines talk back.

---

## What It Does

MoldWatch AI is a real-time process monitoring dashboard for injection molding operations. It tracks six critical process variables, flags deviations, and uses the Claude AI API to deliver live, actionable corrective suggestions — the way an experienced tech would call them out on the floor.

### Monitored Variables
| Variable | Unit | Nominal |
|---|---|---|
| Cycle Time | sec | 28 |
| Melt Temperature | °F | 430 |
| Injection Pressure | psi | 1200 |
| Hold Pressure | psi | 800 |
| Cooling Time | sec | 12 |
| Shot Weight | g | 45 |

---

## Features

- 🟢 **Live status indicators** — OK / WARN / CRITICAL with color-coded glow
- 📈 **Sparkline trend charts** per variable (last 60 readings)
- 🤖 **AI Process Advisor** — Claude API analyzes readings every 10 seconds and returns actionable corrective steps in plain tech language
- ⚡ **Fault injection** — simulate a process drift to test AI response
- 📊 **Shot counter, scrap counter, efficiency %** — live production metrics
- 🎨 Dark industrial UI built with React inline styles + JetBrains Mono

---

## Tech Stack

- React (functional components + hooks)
- Anthropic Claude API (`claude-sonnet-4-20250514`)
- Pure CSS animations
- No external UI libraries

---

## Getting Started

### 1. Clone the repo
```bash
git clone https://github.com/jueinjda/moldwatch-ai.git
cd moldwatch-ai
```

### 2. Install dependencies
```bash
npm install
```

### 3. Add your Claude API key

The component calls the Anthropic API directly. Add your key to your environment or proxy setup:

```bash
VITE_ANTHROPIC_API_KEY=your_key_here
```
