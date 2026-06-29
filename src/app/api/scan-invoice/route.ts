import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { base64, mediaType } = await req.json()

    if (!base64 || base64 === 'test') {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
    }

    const today = new Date().toISOString().split('T')[0]
    const prompt = 'Extract invoice details from this image. Return ONLY a raw JSON object (no markdown, no backticks, no explanation) with these fields: supplier (string), invoice_number (string), invoice_date (YYYY-MM-DD string), due_date (YYYY-MM-DD or null), notes (string), lines (array of objects with: description string, amount number, vat_amount number, category_key string). For category_key use: cost_of_sales for food/meat/frozen items, other for everything else. Use Total Incl column for amount. If no date found use ' + today + '. IMPORTANT: Return raw JSON only, no other text.'

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: base64 }
            },
            { type: 'text', text: prompt }
          ]
        }]
      })
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('Anthropic error:', response.status, errText)
      return NextResponse.json({ error: 'AI error ' + response.status }, { status: 500 })
    }

    const result = await response.json()
    let text = result.content?.[0]?.text || ''
    
    // Strip markdown code blocks if present
    text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
    
    // Extract JSON from response - find first { to last }
    const jsonStart = text.indexOf('{')
    const jsonEnd = text.lastIndexOf('}')
    if (jsonStart === -1 || jsonEnd === -1) {
      console.error('No JSON found in response:', text)
      return NextResponse.json({ error: 'Could not extract data from invoice' }, { status: 500 })
    }
    
    const jsonStr = text.substring(jsonStart, jsonEnd + 1)
    const data = JSON.parse(jsonStr)

    return NextResponse.json(data)
  } catch (e: unknown) {
    console.error('Invoice scan error:', e)
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
