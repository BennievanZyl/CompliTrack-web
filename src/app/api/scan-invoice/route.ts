import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { base64, mediaType } = await req.json()

    if (!base64 || base64 === 'test') {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY not set')
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: base64 }
            },
            {
              type: 'text',
              text: 
            }
          ]
        }]
      })
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('Anthropic API error:', response.status, errText)
      return NextResponse.json({ error:  }, { status: 500 })
    }

    const result = await response.json()
    const text = result.content?.[0]?.text || ''
    const clean = text.replace(/
?/g, '').trim()
    const data = JSON.parse(clean)

    return NextResponse.json(data)
  } catch (e: unknown) {
    console.error('Invoice scan error:', e)
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
