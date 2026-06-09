// memory/episodic.js
// What this does: stores every Q&A pair that got a 👍
// Why: if someone already asked "how do refunds work?" and got a great answer,
//      the NEXT similar question should just return that answer directly
//      — skipping the whole retrieval pipeline entirely (faster + cheaper)
// Storage: Redis (could be Postgres in production)

import { createClient } from 'redis'
import { embed } from '../embedder.js'

let redisClient = null

async function getClient() {
  if (!redisClient) {
    redisClient = createClient({ url: process.env.REDIS_URL })
    redisClient.on('error', err => console.error('Redis error:', err))
    await redisClient.connect()
  }
  return redisClient
}

// Save a Q&A pair that was marked helpful
export async function saveEpisode(question, answer, sources) {
  const client = await getClient()
  const vector = await embed(question)

  const episode = {
    question,
    answer,
    sources,
    vector,
    helpfulCount: 1,
    createdAt: Date.now()
  }

  const id = `episode:${Date.now()}`
  await client.setEx(id, 60 * 60 * 24 * 30, JSON.stringify(episode)) // 30 days

  // Keep an index of all episode keys
  await client.lPush('episode:index', id)
  await client.lTrim('episode:index', 0, 199) // keep last 200 episodes

  console.log(`✓ Saved episode to memory: "${question.slice(0, 50)}..."`)
}

// Search past episodes for a similar question
// Returns the best matching past answer if similarity > 0.85
export async function searchEpisodes(question) {
  const client = await getClient()
  const questionVector = await embed(question)

  const keys = await client.lRange('episode:index', 0, -1)
  if (!keys.length) return null

  let bestMatch = null
  let bestScore = 0

  for (const key of keys) {
    const raw = await client.get(key)
    if (!raw) continue
    const episode = JSON.parse(raw)

    // Cosine similarity between question vectors
    const score = cosineSimilarity(questionVector, episode.vector)

    if (score > bestScore) {
      bestScore = score
      bestMatch = { ...episode, score }
    }
  }

  // Only return if very similar (85%+) — prevents wrong answers
  if (bestScore > 0.85) {
    console.log(`✓ Episodic memory hit! Score: ${bestScore.toFixed(3)}`)
    return bestMatch
  }

  return null
}

// Math: cosine similarity between two vectors
function cosineSimilarity(a, b) {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0)
  const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0))
  const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0))
  return dot / (magA * magB)
}