// slack.js
// What this does: listens for @mentions in Slack → calls your RAG API → replies in thread
// Run this alongside your main server: node --env-file=.env src/slack.js

import pkg from '@slack/bolt'
const { App } = pkg

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
})

const RAG_API = 'http://localhost:3000'

// ── Helper: call your RAG /ask endpoint ───────────────────────
async function askRAG(question, userId) {
  const res = await fetch(RAG_API + '/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, userId })
  })
  return res.json()
}

// ── Helper: format answer for Slack ──────────────────────────
function formatAnswer(data) {
  const lines = []

  // Memory tag
  if (data.fromMemory) {
    lines.push('⚡ *From memory cache*\n')
  }

  // Answer
  lines.push(data.answer)

  // Sources
  if (data.sources?.length) {
    lines.push('\n📄 *Sources:*')
    data.sources.forEach(s => {
      const score = (s.score * 100).toFixed(0)
      lines.push(`• ${s.source} — ${score}% match`)
    })
  }

  return lines.join('\n')
}

// ── Listen for @mentions ──────────────────────────────────────
// Triggered when someone types: @MemRAG how does auth work?
app.event('app_mention', async ({ event, say }) => {
  try {
    // Remove the @bot mention from the question
    const question = event.text.replace(/<@[A-Z0-9]+>/g, '').trim()

    if (!question) {
      await say({
        text: 'Hi! Ask me anything about your knowledge base. Example: _@MemRAG how does auth work?_',
        thread_ts: event.ts
      })
      return
    }

    console.log(`\n💬 Slack question from ${event.user}: "${question}"`)

    // Show typing indicator
    await say({ text: '🔍 Searching knowledge base...', thread_ts: event.ts })

    // Call your RAG API
    const data = await askRAG(question, event.user)

    // Reply in thread with formatted answer
    await say({
      text: formatAnswer(data),
      thread_ts: event.ts,
      // Feedback buttons
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: formatAnswer(data) }
        },
        {
          type: 'actions',
          block_id: `feedback_${Date.now()}`,
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: '👍 Helpful' },
              style: 'primary',
              action_id: 'feedback_helpful',
              value: JSON.stringify({
                chunkIds: (data.sources || []).map(s => s.id),
                question,
                answer: data.answer,
                sources: data.sources
              })
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: '👎 Not helpful' },
              style: 'danger',
              action_id: 'feedback_unhelpful',
              value: JSON.stringify({
                chunkIds: (data.sources || []).map(s => s.id),
                question,
                answer: data.answer,
                sources: data.sources
              })
            }
          ]
        }
      ]
    })
  } catch (err) {
    console.error(err)
    await say({ text: '⚠ Could not reach the knowledge base. Is the RAG server running?', thread_ts: event.ts })
  }
})

// ── Handle 👍 👎 button clicks ────────────────────────────────
app.action('feedback_helpful', async ({ ack, body, client }) => {
  await ack()
  try {
    const { chunkIds, question, answer, sources } = JSON.parse(body.actions[0].value)
    await fetch(RAG_API + '/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chunkIds, helpful: true, question, answer, sources })
    })
    // Update the message to show feedback was recorded
    await client.chat.update({
      channel: body.channel.id,
      ts: body.message.ts,
      text: body.message.text,
      blocks: [{
        type: 'section',
        text: { type: 'mrkdwn', text: body.message.blocks[0].text.text + '\n\n✅ *Marked as helpful — knowledge base updated!*' }
      }]
    })
  } catch (err) { console.error(err) }
})

app.action('feedback_unhelpful', async ({ ack, body, client }) => {
  await ack()
  try {
    const { chunkIds, question, answer, sources } = JSON.parse(body.actions[0].value)
    await fetch(RAG_API + '/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chunkIds, helpful: false, question, answer, sources })
    })
    await client.chat.update({
      channel: body.channel.id,
      ts: body.message.ts,
      text: body.message.text,
      blocks: [{
        type: 'section',
        text: { type: 'mrkdwn', text: body.message.blocks[0].text.text + '\n\n📉 *Marked as unhelpful — chunk weights reduced.*' }
      }]
    })
  } catch (err) { console.error(err) }
})

// ── Start the bot ─────────────────────────────────────────────
;(async () => {
  await app.start()
  console.log('⚡ MemRAG Slack bot is running!')
  console.log('→ Mention @MemRAG in any channel to ask a question\n')
})()