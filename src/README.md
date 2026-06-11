# MemRAG — Living Knowledge Base

> A team-level agentic RAG system that gets smarter the more your team uses it.

Unlike static RAG systems, MemRAG uses a **3-layer memory architecture** where team feedback continuously adjusts retrieval weights — the system gets smarter the more your team uses it.

![Demo](https://img.shields.io/badge/status-live-brightgreen)
![Stack](https://img.shields.io/badge/stack-Node.js%20%7C%20React%20%7C%20Qdrant%20%7C%20Redis-blue)
![LLM](https://img.shields.io/badge/LLM-Groq%20LLaMA%2070B-orange)

---

## The Core Insight

Most RAG systems treat every document chunk equally forever. MemRAG treats retrieval as a **living system**:

- Chunks that repeatedly lead to helpful answers get **boosted** (weight → 2.0)
- Chunks that confuse users get **downweighted** (weight → 0.3)
- The whole team's feedback improves retrieval for everyone

---

## Architecture

```
User (Slack / React UI)
         │
         ▼
   Memory Router
   ┌──────────────────────────────────────┐
   │  1. Episodic Memory (Redis)          │  ← answered before? return instantly
   │  2. Short-term Memory (Redis)        │  ← enrich query with session context
   │  3. Semantic Memory (Qdrant)         │  ← vector search with weighted chunks
   └──────────────────────────────────────┘
         │
         ▼
   Groq LLaMA 70B → Answer + Sources
         │
         ▼
   Feedback (👍 👎) → Update chunk weights
         │
         ▼
   System improves for next question
```

---

## The 3 Memory Layers

### 1. Short-term Memory (Redis)
Remembers what a user asked recently. If you asked about auth 2 minutes ago, your next question gets that context automatically — so follow-up questions like "what token does it use?" work correctly.

### 2. Semantic Memory (Qdrant, permanent)
Standard vector search with a twist: chunk weights drift over time based on feedback.

```
weight = 1.0 + confidence × (helpfulRatio - 0.5) × 1.4

- New chunk:          weight = 1.0  (neutral)
- 8/10 helpful votes: weight = 1.56 (boosted)
- 2/10 helpful votes: weight = 0.72 (downweighted)
```

### 3. Episodic Memory (Redis)
Stores entire Q&A pairs that were marked helpful. Next time anyone asks a similar question (>85% cosine similarity), returns the cached answer **instantly** — skipping Qdrant and Groq entirely. Zero latency, zero API cost.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Express |
| Embeddings | Jina v3 (1M free tokens/month) |
| Vector DB | Qdrant (free tier) |
| LLM | Groq LLaMA 3.3 70B (free tier) |
| Memory | Redis (free tier) |
| Frontend | React + Tailwind CSS + Vite |
| Bot | Slack Bolt SDK (Socket Mode) |

---

## Features

- 📄 **Document indexing** — paste any text, auto-chunked and embedded
- 🔍 **Semantic search** — finds relevant chunks by meaning, not keywords
- 🧠 **3-layer memory** — session context, weighted vectors, answer cache
- 👍 **Feedback loop** — team votes improve retrieval over time
- ⚡ **Episodic cache** — repeated questions answered instantly
- 💬 **Slack bot** — ask questions directly in Slack with feedback buttons
- 📊 **Live weight dashboard** — see chunk weights changing in real time

---

## Getting Started

### Prerequisites
- Node.js 18+
- Free accounts at: [Jina](https://jina.ai), [Qdrant](https://cloud.qdrant.io), [Groq](https://console.groq.com), [Redis](https://redis.io/try-free)

### Installation

```bash
# Clone the repo
git clone https://github.com/YOURUSERNAME/memrag.git
cd memrag

# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Fill in your API keys
```

### Environment Variables

```env
JINA_KEY=your-jina-key
GROQ_KEY=your-groq-key
QDRANT_URL=your-qdrant-url
QDRANT_KEY=your-qdrant-key
REDIS_URL=your-redis-url
SLACK_BOT_TOKEN=xoxb-your-token
SLACK_SIGNING_SECRET=your-secret
SLACK_APP_TOKEN=xapp-your-token
```

### Run

```bash
# Start RAG server
npm start

# Start Slack bot (separate terminal)
node --env-file=.env src/slack.js

# Start React UI (in rag-ui folder)
npm run dev
```

---

## API Endpoints

```
POST /index      → index a document into the knowledge base
POST /ask        → ask a question (runs through all 3 memory layers)
POST /feedback   → record 👍 or 👎 (updates chunk weights)
GET  /stats      → get current chunk weights
```

---

## Project Structure

```
memrag/
├── src/
│   ├── index.js        ← Express server + all endpoints
│   ├── embedder.js     ← Jina embeddings
│   ├── store.js        ← Qdrant vector operations
│   ├── chunker.js      ← text splitting
│   ├── llm.js          ← Groq answer generation
│   ├── slack.js        ← Slack bot
│   └── memory/
│       ├── shortTerm.js  ← Redis session memory
│       ├── episodic.js   ← Redis Q&A cache
│       └── semantic.js   ← chunk weight updates
└── rag-ui/             ← React + Tailwind dashboard
```

---

## What Makes It Different

| Feature | Standard RAG | MemRAG |
|---|---|---|
| Chunk weights | Static forever | Drift based on feedback |
| Memory scope | None or per-user | Team-level shared |
| Repeated questions | Full retrieval every time | Instant cache hit |
| Gets smarter over time | No | Yes — improves with usage |
| Interface | API only | React UI + Slack bot |

---

## How I'd Scale This

- **Multiple RAG servers** behind a load balancer
- **Qdrant cluster** instead of single node for millions of documents
- **Redis cluster** for memory across distributed instances
- **Message queue** (BullMQ) for async document indexing
- **Webhook** to auto-index on every GitHub commit

---

*Built with Node.js, React, Qdrant, Redis, Groq, Jina, and Slack API*
