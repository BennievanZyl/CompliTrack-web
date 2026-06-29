import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { base64, mediaType } = await req.json()

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 }
            },
            {
              type: 'text',
              text: `Extract invoice details from this image. Return ONLY valid JSON with this exact structure:
{
  "supplier": "supplier name or company",
  "invoice_number": "invoice number if visible",
  "invoice_date": "YYYY-MM-DD format",
  "due_date": "YYYY-MM-DD format or null",
  "notes": "any reference or PO number",
  "lines": [
    {
      "description": "item or service description",
      "amount": 123.45,
      "vat_amount": 16.08,
      "category_key": "one of: cost_of_sales, cleaning, packaging, banking, accounting, franchise_fee, marketing, casual_wages, micros, staff, credit_cards, delivery, gas, insurance, internet, pest_control, rental, repair, salaries, security, stationery, telephone, municipality, fuel, other"
    }
  ]
}

Rules:
- amounts must be numbers not strings
- If VAT not shown separately calculate as amount / 1.15 * 0.15
- Choose the most appropriate category_key for each line
- If invoice_date not found use today ${new Date().toISOString().split('T')[0]}
- Return ONLY the JSON no other text`
            }
          ]
        }]
      })
    })

    const result = await response.json()
    const text = result.content?.[0]?.text || ''
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const data = JSON.parse(clean)

    return NextResponse.json(data)
  } catch (e) {
    console.error('Invoice scan error:', e)
    return NextResponse.json({ error: 'Scan failed' }, { status: 500 })
  }
}
