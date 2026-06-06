// index.js
// What this does: runs an Express server with 3 endpoints:
//   POST /index  → upload a document into the knowledge base
//   POST /ask    → ask a question, get an answer
//   POST /feedback → give 👍 or 👎 on an answer

import express from 'express'
import { setupCollection, saveChunk, search, recordFeedback } from './store.js'
import { generateAnswer } from './llm.js'
import { chunkText } from './chunker.js'

const app = express()
app.use(express.json())

// ── POST /index ───────────────────────────────────────────────
// Upload any text into the knowledge base
// Body: { text: "...", source: "my-doc.txt" }
app.post('/index', async (req, res) => {
  try {
    const { text, source = 'unknown' } = req.body
    if (!text) return res.status(400).json({ error: 'text is required' })

    // Split into chunks
    const chunks = chunkText(text)
    console.log(`\n📄 Indexing "${source}" → ${chunks.length} chunks`)

    // Save each chunk to Qdrant
    for (const chunk of chunks) {
      await saveChunk(chunk, source)
    }

    res.json({
      success: true,
      message: `Indexed ${chunks.length} chunks from "${source}"`
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /ask ─────────────────────────────────────────────────
// Ask a question — returns answer + the sources used
// Body: { question: "how does auth work?" }
app.post('/ask', async (req, res) => {
  try {
    const { question } = req.body
    if (!question) return res.status(400).json({ error: 'question is required' })

    console.log(`\n❓ Question: "${question}"`)

    // 1. Find the most relevant chunks
    const chunks = await search(question)
    console.log(`✓ Found ${chunks.length} relevant chunks`)

    if (chunks.length === 0) {
      return res.json({ answer: "I don't have any documents in my knowledge base yet. Please index some documents first.", sources: [] })
    }

    // 2. Generate answer using Gemini
    const answer = await generateAnswer(question, chunks)
    console.log(`✓ Answer generated`)

    res.json({
      answer,
      sources: chunks.map(c => ({
        id: c.id,
        source: c.source,
        preview: c.text.slice(0, 120) + '...',
        score: c.score
      }))
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /feedback ────────────────────────────────────────────
// Give thumbs up or down on a chunk — this is the memory layer
// Body: { chunkId: 123, helpful: true }
app.post('/feedback', async (req, res) => {
  try {
    const { chunkId, helpful } = req.body
    await recordFeedback(chunkId, helpful)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Start server ──────────────────────────────────────────────
async function start() {
  await setupCollection()   // make sure Qdrant collection exists
  app.listen(3000, () => {
    console.log('\n🚀 RAG bot running at http://localhost:3000')
    console.log('Endpoints:')
    console.log('  POST /index    → add documents')
    console.log('  POST /ask      → ask questions')
    console.log('  POST /feedback → give feedback\n')
  })
}

start()