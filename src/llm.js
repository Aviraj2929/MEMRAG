// llm.js
// What this does: takes a question + retrieved chunks → asks Groq to answer
// Groq only sees the chunks we retrieved — it can't make things up from thin air

import Groq from 'groq-sdk'

export async function generateAnswer(question, chunks) {
  const groq = new Groq({ apiKey: process.env.GROQ_KEY })

  // Format the retrieved chunks as context
  const context = chunks
    .map((c, i) => `[Source ${i + 1} — ${c.source} (relevance: ${(c.score * 100).toFixed(0)}%)]\n${c.text}`)
    .join('\n\n---\n\n')

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',  // Groq's best free model
    messages: [
      {
        role: 'system',
        content: `You are a helpful assistant. Answer questions using ONLY the context provided.
If the context does not contain the answer, say "I don't have that in my knowledge base."
Always mention which source(s) you used at the end.`
      },
      {
        role: 'user',
        content: `CONTEXT:\n${context}\n\nQUESTION: ${question}`
      }
    ],
    max_tokens: 512,
  })

  return response.choices[0].message.content
}