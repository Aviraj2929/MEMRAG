import express from 'express'
import cors from 'cors'
import { setupCollection, saveChunk, search, recordFeedback } from './store.js'
import { generateAnswer } from './llm.js'
import { chunkText } from './chunker.js'
import { saveToShortTerm, getShortTerm, buildSessionContext } from './memory/shortTerm.js'
import { saveEpisode, searchEpisodes } from './memory/episodic.js'
import { updateChunkWeight, getWeightStats } from './memory/semantic.js'

const app = express()
app.use(cors())
app.use(express.json())

// ── POST /index ───────────────────────────────────────────────
app.post('/index', async (req, res) => {
  try {
    const { text, source = 'unknown' } = req.body
    if (!text) return res.status(400).json({ error: 'text is required' })
    const chunks = chunkText(text)
    console.log(`\n📄 Indexing "${source}" → ${chunks.length} chunks`)
    for (const chunk of chunks) await saveChunk(chunk, source)
    res.json({ success: true, message: `Indexed ${chunks.length} chunks from "${source}"` })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /ask — all 3 memory layers ──────────────────────────
app.post('/ask', async (req, res) => {
  try {
    const { question, userId = 'anonymous' } = req.body
    if (!question) return res.status(400).json({ error: 'question is required' })
    console.log(`\n❓ [${userId}] "${question}"`)

    // Layer 1: Episodic memory — already answered this before?
    try {
      const episode = await searchEpisodes(question)
      if (episode) {
        console.log(`⚡ Episodic hit! score: ${episode.score.toFixed(3)}`)
        return res.json({
          answer: episode.answer,
          sources: episode.sources,
          fromMemory: true,
          memoryScore: episode.score
        })
      }
    } catch (e) { console.log('Episodic memory skipped:', e.message) }

    // Layer 2: Short-term memory — what has this user asked recently?
    let enrichedQuery = question
    try {
      const history = await getShortTerm(userId)
      const sessionContext = buildSessionContext(history)
      if (sessionContext) {
        enrichedQuery = `${sessionContext}\n\nCurrent question: ${question}`
        console.log(`✓ Session context added (${history.length} recent messages)`)
      }
    } catch (e) { console.log('Short-term memory skipped:', e.message) }

    // Layer 3: Semantic search in Qdrant
    const chunks = await search(enrichedQuery)
    console.log(`✓ Retrieved ${chunks.length} chunks`)

    if (!chunks.length) {
      return res.json({ answer: "I don't have any documents yet. Please index some first.", sources: [], fromMemory: false })
    }

    const answer = await generateAnswer(question, chunks)
    console.log(`✓ Answer generated`)

    // Save to short-term memory
    try { await saveToShortTerm(userId, question, answer) } catch (e) {}

    const sources = chunks.map(c => ({
      id: c.id, source: c.source,
      preview: c.text.slice(0, 120) + '...',
      score: c.score
    }))

    res.json({ answer, sources, fromMemory: false })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /feedback — teaches the system ───────────────────────
app.post('/feedback', async (req, res) => {
  try {
    const { chunkIds = [], helpful, question, answer, sources } = req.body

    // Update chunk weights in Qdrant
    for (const id of chunkIds) {
      try { await updateChunkWeight(id, helpful) } catch (e) {}
      try { await recordFeedback(id, helpful) } catch (e) {}
    }

    // If helpful → save Q&A to episodic memory for instant future recall
    if (helpful && question && answer) {
      try { await saveEpisode(question, answer, sources || []) } catch (e) {}
      console.log(`⚡ Saved to episodic memory: "${question.slice(0, 50)}..."`)
    }

    res.json({ success: true, message: helpful ? '👍 Chunk weights boosted' : '👎 Chunk weights reduced' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /stats — chunk weights (never crashes) ────────────────
app.get('/stats', async (req, res) => {
  try {
    const stats = await getWeightStats()
    res.json({ chunks: stats || [] })
  } catch {
    res.json({ chunks: [] })
  }
})

// ── Start ─────────────────────────────────────────────────────
async function start() {
  await setupCollection()
  app.listen(3000, () => {
    console.log('\n🚀 MemRAG running at http://localhost:3000')
    console.log('  POST /index     → add documents')
    console.log('  POST /ask       → ask (3 memory layers active)')
    console.log('  POST /feedback  → 👍 👎 teaches the system')
    console.log('  GET  /stats     → chunk weights\n')
  })
}

start()