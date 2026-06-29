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

    const today = new Date().toISOString().split('T')[0]
    const prompt = `Extract invoice details from this image. Return ONLY valid JSON:
{
  "supplier": "supplier company name",
  "invoice_number": "invoice number",
  "invoice_date": "YYYY-MM-DD",
  "due_date": "YYYY-MM-DD or null",
  "notes": "reference or PO number if any",
  "lines": [
    {
      "description": "item description",
      "amount": 123.45,
      "vat_amount": 16.08,
      "category_key": "cost_of_sales"
    }
  ]
}
Rules: amounts are numbers. Use Total (Incl) column for amount. VAT column for vat_amount. For food/meat/frozen use cost_of_sales. If no date found use ${today}. Return ONLY JSON.`

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
            { type: 'text', text: prompt }
          ]
        }]
      })
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('Anthropic API error:', response.status, errText)
      return NextResponse.json({ error: 'AI service error: ' + response.status }, { status: 500 })
    }

    const result = await response.json()
    const text = result.content?.[0]?.text || ''
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const data = JSON.parse(clean)

    return NextResponse.json(data)
  } catch (e: unknown) {
    console.error('Invoice scan error:', e)
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
