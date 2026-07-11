import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { base64, mediaType, supplierTemplate } = await req.json()

    if (!base64 || base64 === 'test') {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 })
    }

    console.log('[scan-invoice] base64 length:', base64.length, 'mediaType:', mediaType)

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
    }

    const today = new Date().toISOString().split('T')[0]

    let columnGuidance = ''
    if (supplierTemplate?.columns?.length) {
      const cols = supplierTemplate.columns as { name: string; maps_to: string | null }[]
      const colList = cols.map((c: { name: string; maps_to: string | null }, i: number) => {
        const label = c.name ? `"${c.name}"` : `(unnamed)`
        const meaning = c.maps_to || 'ignore'
        return `  Column ${i + 1}: ${label} → ${meaning}`
      }).join('\n')
      const priceCol = cols.find((c: { name: string; maps_to: string | null }) => c.maps_to === 'unit_price_excl')
      const priceColNum = priceCol ? cols.indexOf(priceCol) + 1 : null
      const priceRef = priceCol ? (priceCol.name ? `"${priceCol.name}" (column ${priceColNum})` : `column ${priceColNum}`) : null
      const qtyCol = cols.find((c: { name: string; maps_to: string | null }) => c.maps_to === 'qty')
      const qtyColNum = qtyCol ? cols.indexOf(qtyCol) + 1 : null
      const qtyRef = qtyCol ? (qtyCol.name ? `"${qtyCol.name}" (column ${qtyColNum})` : `column ${qtyColNum}`) : null
      columnGuidance = `\n\nSUPPLIER INVOICE LAYOUT FOR "${supplierTemplate.name}" (${cols.length} columns total):\nCount the columns left to right on the invoice — they always appear in this order:\n${colList}\n${priceRef ? `\nCRITICAL: Extract unit_price from ${priceRef} only. Do NOT use any incl-VAT or total-incl column for unit_price.` : ''}\n${qtyRef ? `Extract qty from ${qtyRef}.` : ''}${supplierTemplate.vatIncluded === false ? '\nThis supplier quotes prices excluding VAT already.' : '\nAlways use the excl-VAT column, never the incl-VAT or total column.'}`
    }

    const prompt = `Extract ALL line items from this invoice. Return ONLY raw JSON (no markdown):
{ "supplier": string, "invoice_number": string, "invoice_date": "YYYY-MM-DD", "due_date": "YYYY-MM-DD or null", "notes": string, "lines": [{ "description": string, "qty": number, "uom": string, "unit_price": number, "amount": number, "vat_amount": number, "category_key": string }] }

For each line:
- description = item name only (no qty)
- qty = quantity ordered
- uom = unit of measure (KG/CASE/BKT/Unit etc)
- unit_price = PRICE PER UNIT EXCLUDING VAT. CRITICAL: if the invoice shows both excl-VAT and incl-VAT columns, you MUST use the excl-VAT column. Never use "Total Incl" or "Incl VAT" as the unit price.
- amount = Total Incl VAT for that line
- vat_amount = VAT amount for that line
- category_key: cost_of_sales for food/meat/frozen/dairy, packaging for packaging, cleaning for cleaning, other for rest
${columnGuidance}
Extract EVERY visible line item. If date not found use ${today}. Return raw JSON only.`

    const isPdf = (mediaType || '').includes('pdf')
    const contentBlock = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: base64 } }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: prompt }] }]
      })
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('Anthropic error:', response.status, errText)
      return NextResponse.json({ error: 'AI error ' + response.status + ': ' + errText.slice(0, 300) }, { status: 500 })
    }

    const result = await response.json()
    const text = result.content?.[0]?.text || ''
    const jsonStart = text.indexOf('{')
    const jsonEnd = text.lastIndexOf('}')
    if (jsonStart === -1 || jsonEnd === -1) {
      return NextResponse.json({ error: 'Could not extract data from invoice' }, { status: 500 })
    }
    try {
      const data = JSON.parse(text.substring(jsonStart, jsonEnd + 1))
      return NextResponse.json(data)
    } catch {
      return NextResponse.json({ error: 'Could not parse invoice data' }, { status: 500 })
    }
  } catch (e: unknown) {
    console.error('Invoice scan error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}
