// memory/semantic.js
// What this does: adjusts chunk weights in Qdrant based on 👍 / 👎 feedback
// Why: chunks that consistently help users rise to the top
//      chunks that confuse users sink — system gets smarter over time
// This is the "living system" — the core differentiator of this project

import { QdrantClient } from '@qdrant/js-client-rest'

const COLLECTION = 'rag-bot-docs'

function client() {
  return new QdrantClient({
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_KEY
  })
}

// Called when user gives 👍 or 👎 on an answer
// Updates the chunk's vote counts and recalculates its weight
export async function updateChunkWeight(chunkId, helpful) {
  const qdrant = client()

  // Fetch current payload
  const results = await qdrant.retrieve(COLLECTION, {
    ids: [chunkId],
    with_payload: true
  })

  if (!results.length) return

  const p = results[0].payload
  const helpfulVotes = (p.helpfulVotes || 0) + (helpful ? 1 : 0)
  const totalVotes = (p.totalVotes || 0) + 1
  const ratio = helpfulVotes / totalVotes

  // Weight formula:
  // - Starts at 1.0 (neutral)
  // - Rises toward 2.0 as more users find it helpful
  // - Sinks toward 0.3 if users consistently find it unhelpful
  // - Requires at least 3 votes before moving much (prevents noise)
  const confidence = Math.min(totalVotes / 10, 1)  // 0 to 1, based on vote count
  const newWeight = 1.0 + (confidence * (ratio - 0.5) * 1.4)
  const clampedWeight = Math.max(0.3, Math.min(2.0, newWeight))

  await qdrant.setPayload(COLLECTION, {
    payload: { helpfulVotes, totalVotes, weight: clampedWeight },
    points: [chunkId]
  })

  console.log(`✓ Chunk ${chunkId} weight: ${clampedWeight.toFixed(2)} (${helpfulVotes}/${totalVotes} helpful)`)
  return clampedWeight
}

// Get the current weight stats for all chunks — useful for debugging
export async function getWeightStats() {
  const qdrant = client()
  const results = await qdrant.scroll(COLLECTION, {
    with_payload: true,
    limit: 100
  })

  return results.points.map(p => ({
    id: p.id,
    source: p.payload.source,
    weight: p.payload.weight || 1.0,
    helpfulVotes: p.payload.helpfulVotes || 0,
    totalVotes: p.payload.totalVotes || 0,
    preview: p.payload.text?.slice(0, 80) + '...'
  }))
}