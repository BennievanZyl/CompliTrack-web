// Public compliance report page — no auth required, server-rendered
// URL: /compliance/report/[sessionId]
import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

function sb() {
  return createClient(SUPABASE_URL, SUPABASE_KEY)
}

export const dynamic = 'force-dynamic'

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-ZA', {
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Africa/Johannesburg',
  })
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-ZA', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'Africa/Johannesburg',
  })
}

export default async function ReportPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const client = sb()
  const { sessionId } = await params

  const { data: session } = await client
    .from('daily_sessions')
    .select('id, session_date, status, store_id, signed_off_at')
    .eq('id', sessionId)
    .single()

  if (!session) return notFound()

  const { data: store } = await client
    .from('stores')
    .select('name')
    .eq('id', session.store_id)
    .single()

  const { data: issues } = await client
    .from('compliance_issues')
    .select('id, description, photo_url, resolution_photo_url, resolution_note, is_uniform_violation, status, created_at, resolved_at, employee_id, resolved_by_employee_id')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  const empIds = [...new Set((issues || []).filter((i: any) => i.employee_id).map((i: any) => i.employee_id))]
  const { data: employees } = empIds.length
    ? await client.from('employees').select('id, full_name').in('id', empIds)
    : { data: [] }
  const empMap: Record<string, string> = Object.fromEntries(
    (employees || []).map((e: any) => [e.id, e.full_name])
  )

  // Fetch names for anyone who resolved an issue (may differ from the person responsible)
  const resolverIds = [...new Set(
    (issues || [])
      .filter((i: any) => i.resolved_by_employee_id && !empIds.includes(i.resolved_by_employee_id))
      .map((i: any) => i.resolved_by_employee_id)
  )]
  const { data: resolvers } = resolverIds.length
    ? await client.from('employees').select('id, full_name').in('id', resolverIds)
    : { data: [] }
  // Combined map covers both responsible employees AND resolvers
  const resolverMap: Record<string, string> = {
    ...empMap,
    ...Object.fromEntries((resolvers || []).map((e: any) => [e.id, e.full_name]))
  }

  const openIssues     = (issues || []).filter((i: any) => !['resolved', 'closed'].includes(i.status))
  const resolvedIssues = (issues || []).filter((i: any) =>  ['resolved', 'closed'].includes(i.status))
  const storeName      = store?.name ?? 'Store'
  const sessionDate    = formatDate(session.session_date)

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Compliance Report — {storeName}</title>
        <style>{`
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                 background: #f4f6f8; color: #1a1a2e; min-height: 100vh; }
          .page-header { background: #1a3a2a; color: white; padding: 24px 20px 20px; }
          .header-logo { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
          .logo-icon { width: 36px; height: 36px; background: #2d7a4f; border-radius: 8px;
                       display: flex; align-items: center; justify-content: center; font-size: 20px; }
          .store-name { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
          .session-date { font-size: 13px; opacity: 0.65; }
          .summary-bar { display: flex; gap: 10px; padding: 16px 20px; flex-wrap: wrap; }
          .stat { flex: 1; min-width: 90px; background: white; border-radius: 10px;
                  padding: 14px 16px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
          .stat .num { font-size: 28px; font-weight: 700; }
          .stat .lbl { font-size: 11px; color: #666; margin-top: 2px;
                       text-transform: uppercase; letter-spacing: .5px; }
          .stat-red .num   { color: #dc2626; }
          .stat-green .num { color: #16a34a; }
          .stat-blue .num  { color: #2563eb; }
          .section { padding: 0 20px 8px; }
          .section-title { font-size: 13px; font-weight: 600; color: #555;
                           text-transform: uppercase; letter-spacing: .5px; margin: 16px 0 8px; }
          .issue-card { background: white; border-radius: 12px; overflow: hidden;
                        margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
          .issue-header { padding: 14px 16px 10px; display: flex; align-items: flex-start; gap: 10px; }
          .issue-num { width: 26px; height: 26px; border-radius: 50%; background: #fee2e2;
                       color: #dc2626; font-size: 12px; font-weight: 700;
                       display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
          .issue-num-resolved { width: 26px; height: 26px; border-radius: 50%; background: #dcfce7;
                                color: #16a34a; font-size: 12px; font-weight: 700;
                                display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
          .issue-body { flex: 1; }
          .issue-desc { font-size: 15px; font-weight: 600; line-height: 1.4; }
          .issue-desc-resolved { font-size: 15px; font-weight: 600; line-height: 1.4; color: #555; }
          .issue-meta { font-size: 12px; color: #888; margin-top: 4px;
                        display: flex; flex-wrap: wrap; gap: 8px; }
          .badge-open     { display: inline-flex; padding: 2px 8px; border-radius: 999px;
                            font-size: 11px; font-weight: 600; background: #fee2e2; color: #dc2626; }
          .badge-resolved { display: inline-flex; padding: 2px 8px; border-radius: 999px;
                            font-size: 11px; font-weight: 600; background: #dcfce7; color: #16a34a; }
          .badge-uniform  { display: inline-flex; padding: 2px 8px; border-radius: 999px;
                            font-size: 11px; font-weight: 600; background: #fef3c7; color: #d97706; }
          .issue-photo { width: 100%; max-height: 280px; object-fit: cover;
                         border-top: 1px solid #f0f0f0; display: block; }
          .photo-label { font-size: 11px; color: #aaa; padding: 6px 16px 10px; }
          .resolution-section { border-top: 1px solid #f0f0f0; padding: 10px 16px 14px; }
          .resolution-label { font-size: 11px; color: #16a34a; font-weight: 600;
                              text-transform: uppercase; letter-spacing: .5px; margin-bottom: 6px; }
          .empty { text-align: center; padding: 32px 20px; color: #aaa; font-size: 14px; }
          .footer { text-align: center; padding: 24px 20px; color: #bbb; font-size: 12px; }
          @media print {
            body { background: white; }
            .issue-card { box-shadow: none; border: 1px solid #e5e7eb; }
          }
        `}</style>
      </head>
      <body>
        <div className="page-header">
          <div className="header-logo">
            <div className="logo-icon">✓</div>
            <div>
              <div style={{ fontSize: 11, opacity: 0.6, letterSpacing: 1, textTransform: 'uppercase' }}>CompliTrack</div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Compliance Report</div>
            </div>
          </div>
          <div className="store-name">{storeName}</div>
          <div className="session-date">{sessionDate}</div>
        </div>

        <div className="summary-bar">
          <div className="stat stat-blue">
            <div className="num">{(issues || []).length}</div>
            <div className="lbl">Total Issues</div>
          </div>
          <div className="stat stat-red">
            <div className="num">{openIssues.length}</div>
            <div className="lbl">Unresolved</div>
          </div>
          <div className="stat stat-green">
            <div className="num">{resolvedIssues.length}</div>
            <div className="lbl">Resolved</div>
          </div>
        </div>

        {openIssues.length > 0 && (
          <div className="section">
            <div className="section-title">🔴 Unresolved Issues</div>
            {openIssues.map((issue: any, i: number) => (
              <div key={issue.id} className="issue-card">
                <div className="issue-header">
                  <div className="issue-num">{i + 1}</div>
                  <div className="issue-body">
                    <div className="issue-desc">{issue.description}</div>
                    <div className="issue-meta">
                      <span>🕐 {formatTime(issue.created_at)}</span>
                      {issue.employee_id && empMap[issue.employee_id] && (
                        <span>👤 {empMap[issue.employee_id]}</span>
                      )}
                      <span className="badge-open">{issue.status}</span>
                      {issue.is_uniform_violation && (
                        <span className="badge-uniform">👕 Uniform</span>
                      )}
                    </div>
                  </div>
                </div>
                {issue.photo_url && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={issue.photo_url} alt="Issue photo" className="issue-photo" />
                    <div className="photo-label">📷 Photo taken at time of flagging</div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {resolvedIssues.length > 0 && (
          <div className="section">
            <div className="section-title">✅ Resolved Issues</div>
            {resolvedIssues.map((issue: any, i: number) => (
              <div key={issue.id} className="issue-card">
                <div className="issue-header">
                  <div className="issue-num-resolved">✓</div>
                  <div className="issue-body">
                    <div className="issue-desc-resolved">{issue.description}</div>
                    <div className="issue-meta">
                      <span>🕐 Flagged {formatTime(issue.created_at)}</span>
                      {issue.employee_id && empMap[issue.employee_id] && (
                        <span>👤 Responsible: {empMap[issue.employee_id]}</span>
                      )}
                      <span className="badge-resolved">resolved</span>
                      {issue.resolved_by_employee_id && resolverMap[issue.resolved_by_employee_id] && (
                        <span style={{ color: '#16a34a' }}>
                          🔧 Fixed by {resolverMap[issue.resolved_by_employee_id]}
                          {issue.resolved_at ? ` · ${formatTime(issue.resolved_at)}` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {issue.photo_url && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={issue.photo_url} alt="Issue photo" className="issue-photo" />
                    <div className="photo-label">📷 Original issue photo</div>
                  </>
                )}
                {(issue.resolution_note || issue.resolution_photo_url) && (
                  <div className="resolution-section">
                    {issue.resolution_note && (
                      <div style={{ fontSize: 13, color: '#374151', marginBottom: 10 }}>
                        📝 {issue.resolution_note}
                      </div>
                    )}
                    {issue.resolution_photo_url && (
                      <>
                        <div className="resolution-label">✅ Resolution Photo</div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={issue.resolution_photo_url}
                          alt="Resolution photo"
                          style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 8 }}
                        />
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {(issues || []).length === 0 && (
          <div className="empty">No compliance issues were logged for this session.</div>
        )}

        <div className="footer">
          Generated by CompliTrack · {new Date().toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}
        </div>
      </body>
    </html>
  )
}
