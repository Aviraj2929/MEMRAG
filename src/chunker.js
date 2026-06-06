
// chunker.js
// What this does: splits a big document into small overlapping pieces
// Why: LLMs have a token limit — we can't send an entire document
// Overlap (50 words) means we don't lose meaning at chunk boundaries

export function chunkText(text, chunkSize = 200, overlap = 50) {
  const words = text.split(/\s+/).filter(Boolean)
  const chunks = []

  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunk = words.slice(i, i + chunkSize).join(' ')
    if (chunk.trim()) chunks.push(chunk)
    if (i + chunkSize >= words.length) break
  }

  return chunks
}