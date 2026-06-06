// embedder.js
// What this does: turns any text into an array of numbers (a vector)
// Why: computers can't compare meaning directly — but they can compare numbers
// Similar meaning = numbers that are mathematically close together

export async function embed(text) {
  const response = await fetch('https://api.jina.ai/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.JINA_KEY}`
    },
    body: JSON.stringify({
      model: 'jina-embeddings-v3',
      input: [text]
    })
  })

  const data = await response.json()

  if (!data.data) {
    throw new Error(`Jina error: ${JSON.stringify(data)}`)
  }

  return data.data[0].embedding  // array of numbers like [0.12, -0.45, 0.88, ...]
}