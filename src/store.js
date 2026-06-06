// store.js
// What this does: saves and searches vectors in Qdrant
// Think of Qdrant like a smart database that finds similar meaning — not exact words

import { QdrantClient } from '@qdrant/js-client-rest'
import { embed } from './embedder.js'

const COLLECTION = 'rag-bot-docs'
const VECTOR_SIZE = 1024  // jina-embeddings-v3 output size

function client() {
  return new QdrantClient({
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_KEY
  })
}

// Creates the collection (like a table) in Qdrant — only runs once
export async function setupCollection() {
  const qdrant = client()
  const { collections } = await qdrant.getCollections()
  const exists = collections.some(c => c.name === COLLECTION)

  if (!exists) {
    await qdrant.createCollection(COLLECTION, {
      vectors: { size: VECTOR_SIZE, distance: 'Cosine' }
    })
    console.log('✓ Qdrant collection created')
  } else {
    console.log('✓ Qdrant collection already exists')
  }
}

// Saves a chunk of text + its vector into Qdrant
export async function saveChunk(text, source) {
  const qdrant = client()
  const vector = await embed(text)

  await qdrant.upsert(COLLECTION, {
    points: [{
      id: Date.now(),           // unique ID for this chunk
      vector,                   // the numbers representing meaning
      payload: {
        text,                   // original text so we can show it
        source,                 // where it came from (filename etc)
        helpfulVotes: 0,        // 👍 count — memory layer seed
        totalVotes: 0,
        createdAt: new Date().toISOString()
      }
    }]
  })
}

// Searches Qdrant for the top 3 chunks most similar to the question
export async function search(question, topK = 3) {
  const qdrant = client()
  const questionVector = await embed(question)

  const results = await qdrant.search(COLLECTION, {
    vector: questionVector,
    limit: topK,
    with_payload: true
  })

  // Return just what we need
  return results.map(r => ({
    text: r.payload.text,
    source: r.payload.source,
    score: r.score,    // 0 to 1 — higher = more relevant
    id: r.id
  }))
}

// Records 👍 or 👎 on a chunk — this is what makes the system learn
export async function recordFeedback(chunkId, helpful) {
  const qdrant = client()

  const results = await qdrant.retrieve(COLLECTION, {
    ids: [chunkId],
    with_payload: true
  })

  if (!results.length) return

  const p = results[0].payload
  const helpfulVotes = p.helpfulVotes + (helpful ? 1 : 0)
  const totalVotes = p.totalVotes + 1

  await qdrant.setPayload(COLLECTION, {
    payload: { helpfulVotes, totalVotes },
    points: [chunkId]
  })

  console.log(`✓ Feedback saved — chunk ${chunkId}: ${helpfulVotes}/${totalVotes} helpful`)
}