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
    const prompt = 'Extract ALL line items from this invoice. Return ONLY raw JSON (no markdown): { "supplier": string, "invoice_number": string, "invoice_date": "YYYY-MM-DD", "due_date": "YYYY-MM-DD or null", "notes": string, "lines": [{ "description": string, "qty": number, "uom": string, "unit_price": number, "amount": number, "vat_amount": number, "category_key": string }] }. For each line: description=item name only (not qty), qty=quantity ordered, uom=unit of measure (KG/CASE/BKT/Unit etc), unit_price=price per unit excl VAT, amount=Total Incl VAT column value, vat_amount=VAT column value. category_key: use cost_of_sales for food/meat/frozen/dairy items, packaging for packaging, cleaning for cleaning products, other for everything else. Extract EVERY line item visible - do not skip any. If date not found use ' + today + '. Return raw JSON only.'

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
            { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: base64 } },
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
    const jsonStart = text.indexOf('{')
    const jsonEnd = text.lastIndexOf('}')
    if (jsonStart === -1 || jsonEnd === -1) {
      return NextResponse.json({ error: 'Could not extract data from invoice' }, { status: 500 })
    }
    const data = JSON.parse(text.substring(jsonStart, jsonEnd + 1))
    return NextResponse.json(data)
  } catch (e: unknown) {
    console.error('Invoice scan error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}
