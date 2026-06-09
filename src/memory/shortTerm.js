// memory/shortTerm.js
// What this does: remembers the last 5 questions a user asked
// Why: if you asked about auth 2 minutes ago, your next question probably relates
// Storage: Redis (fast, in-memory, auto-expires after 1 hour)

import { createClient } from 'redis'

let redisClient = null

async function getClient() {
  if (!redisClient) {
    redisClient = createClient({ url: process.env.REDIS_URL })
    redisClient.on('error', err => console.error('Redis error:', err))
    await redisClient.connect()
  }
  return redisClient
}

// Save a question to a user's recent history
export async function saveToShortTerm(userId, question, answer) {
  const client = await getClient()
  const key = `session:${userId}`

  // Get existing history
  const existing = await client.get(key)
  const history = existing ? JSON.parse(existing) : []

  // Add new entry, keep last 5 only
  history.push({ question, answer, timestamp: Date.now() })
  if (history.length > 5) history.shift()

  // Save back with 1 hour expiry
  await client.setEx(key, 3600, JSON.stringify(history))
}

// Get a user's recent questions — used to enrich new queries
export async function getShortTerm(userId) {
  const client = await getClient()
  const key = `session:${userId}`
  const data = await client.get(key)
  return data ? JSON.parse(data) : []
}

// Build extra context from recent history to add to the question
export function buildSessionContext(history) {
  if (!history.length) return ''
  const recent = history.slice(-3)
  return `Recent conversation context:\n` +
    recent.map(h => `Q: ${h.question}\nA: ${h.answer.slice(0, 150)}...`).join('\n\n')
}