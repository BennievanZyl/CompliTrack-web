import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { imageUrl } = await req.json()
    if (!imageUrl) return NextResponse.json({ error: 'No image URL provided' }, { status: 400 })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 500 })

    const today = new Date().toISOString().split('T')[0]
    const prompt = 'Extract ALL line items from this invoice. Return ONLY raw JSON (no markdown): { "supplier": string, "invoice_number": string, "invoice_date": "YYYY-MM-DD", "due_date": "YYYY-MM-DD or null", "notes": string, "lines": [{ "description": string, "qty": number, "uom": string, "unit_price": number, "amount": number, "vat_amount": number }] }. For each line: description=item name only, qty=quantity, uom=unit of measure, unit_price=price per unit excl VAT, amount=Total Incl VAT, vat_amount=VAT amount. Extract EVERY line item visible. If date not found use ' + today + '. Return raw JSON only.'

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
              source: {
                type: 'url',
                url: imageUrl,
              }
            },
            { type: 'text', text: prompt }
          ]
        }]
      })
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('[scan-invoice-url] Anthropic error:', response.status, errText)
      return NextResponse.json({ error: 'AI error ' + response.status + ': ' + errText.slice(0, 300) }, { status: 500 })
    }

    const result = await response.json()
    const text = result.content?.[0]?.text || ''
    const jsonStart = text.indexOf('{')
    const jsonEnd = text.lastIndexOf('}')
    if (jsonStart === -1 || jsonEnd === -1) {
      console.error('[scan-invoice-url] No JSON in response:', text.slice(0, 300))
      return NextResponse.json({ error: 'Could not extract data from invoice' }, { status: 500 })
    }
    try {
      const data = JSON.parse(text.substring(jsonStart, jsonEnd + 1))
      return NextResponse.json(data)
    } catch {
      return NextResponse.json({ error: 'Could not parse invoice data' }, { status: 500 })
    }
  } catch (e: unknown) {
    console.error('[scan-invoice-url] error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}
