import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL       = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EXPO_PUSH_URL      = "https://exp.host/--/api/v2/push/send";

serve(async () => {
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Current time in SAST (UTC+2), rounded to minute, e.g. "15:30:00"
    const now       = new Date();
    const sastH     = (now.getUTCHours() + 2) % 24;
    const sastM     = now.getUTCMinutes();
    const timeNow   = `${String(sastH).padStart(2, "0")}:${String(sastM).padStart(2, "0")}:00`;
    // "today" in SAST
    const sastMs    = now.getTime() + 2 * 60 * 60 * 1000;
    const today     = new Date(sastMs).toISOString().split("T")[0];

    console.log(`[compliance-alert] running at SAST ${timeNow} for date ${today}`);

    // Find stores with alert enabled at this exact minute
    const { data: settings, error: settErr } = await sb
      .from("compliance_alert_settings")
      .select("store_id, recipient_ids")
      .eq("is_enabled", true)
      .eq("alert_time", timeNow);

    if (settErr) { console.error("[compliance-alert] settings query error:", settErr); }
    if (!settings?.length) {
      console.log("[compliance-alert] no stores scheduled now");
      return new Response("ok – no stores scheduled", { status: 200 });
    }

    for (const setting of settings) {
      const { store_id, recipient_ids } = setting;
      if (!recipient_ids?.length) continue;

      // Find today's session for this store (any status — alert fires even after sign-off)
      const { data: sessions } = await sb
        .from("daily_sessions")
        .select("id, status")
        .eq("store_id", store_id)
        .eq("session_date", today)
        .order("created_at", { ascending: false })
        .limit(1);

      if (!sessions?.length) {
        console.log(`[compliance-alert] no session found today for store ${store_id}`);
        continue;
      }
      const sessionId = sessions[0].id;

      // Get open compliance issues
      const { data: issues } = await sb
        .from("compliance_issues")
        .select("id, description, employee_id, created_at, is_uniform_violation")
        .eq("session_id", sessionId)
.in("status", ["open", "in_progress"]);

      if (!issues?.length) {
        console.log(`[compliance-alert] no open issues for session ${sessionId}`);
        continue;
      }

      // Get store name
      const { data: store } = await sb
        .from("stores")
        .select("name")
        .eq("id", store_id)
        .single();

      // Get employee names for issues that have an assigned employee
      const empIds = [...new Set(issues.filter(i => i.employee_id).map(i => i.employee_id))];
      const { data: employees } = empIds.length
        ? await sb.from("employees").select("id, full_name").in("id", empIds)
        : { data: [] };
      const empMap: Record<string, string> = Object.fromEntries(
        (employees || []).map(e => [e.id, e.full_name])
      );

      // Build the message text
      const storeName   = store?.name ?? "Store";
      const issueLines  = issues.map((issue, i) => {
        const emp  = issue.employee_id ? empMap[issue.employee_id] : null;
        const time = new Date(issue.created_at)
          .toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Johannesburg" });
        const badge = issue.is_uniform_violation ? " 👕" : "";
        return `${i + 1}. ${issue.description}${emp ? ` (${emp})` : ""}${badge} — flagged ${time}`;
      }).join("\n");

      const reportUrl   = `https://complitrack.co.za/compliance/report/${sessionId}`;
      const alertTitle = `🔴 Compliance Alert — ${storeName}`;
      // Structured payload so the chat UI can render a rich card with a clickable link
      const alertPayload = {
        store:      storeName,
        session_id: sessionId,
        count:      issues.length,
        issues:     issues.map((issue, i) => {
          const emp  = issue.employee_id ? empMap[issue.employee_id] : null;
          const time = new Date(issue.created_at)
            .toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Johannesburg" });
          const badge = issue.is_uniform_violation ? " 👕" : "";
          return `${i + 1}. ${issue.description}${emp ? ` (${emp})` : ""}${badge} — flagged ${time}`;
        }),
        report_url: reportUrl,
      };
      const fullMessage = `[COMPLIANCE_ALERT]:${JSON.stringify(alertPayload)}`;

      console.log(`[compliance-alert] sending alert for store ${storeName}: ${issues.length} issues`);

      // Send to each selected recipient
      for (const recipientId of recipient_ids) {
        // Get recipient's profile (expo_push_token + name)
        const { data: profile, error: profileErr } = await sb
          .from("profiles")
          .select("id, full_name, expo_push_token")
          .eq("id", recipientId)
          .single();

        if (profileErr || !profile) {
          console.log(`[compliance-alert] recipient ${recipientId} not found in profiles`, profileErr?.message ?? "");
          continue;
        }

        // ── 1. In-app: find or create a "system" conversation, insert chat message ──
        const { data: existing } = await sb
          .from("conversations")
          .select("id")
          .eq("store_id", store_id)
          .is("participant_1", null)
          .eq("participant_2", recipientId)
          .limit(1);

        let convId: string | null = existing?.[0]?.id ?? null;

        if (!convId) {
          const { data: newConv } = await sb
            .from("conversations")
            .insert({
              store_id,
              participant_1:    null,            // system sender
              participant_2:    recipientId,
              last_message:     alertTitle,
              last_message_at:  new Date().toISOString(),
            })
            .select("id")
            .single();
          convId = newConv?.id ?? null;
        } else {
          await sb.from("conversations").update({
            last_message:    alertTitle,
            last_message_at: new Date().toISOString(),
          }).eq("id", convId);
        }

        if (convId) {
          await sb.from("chat_messages").insert({
            conversation_id: convId,
            sender_id:       null,            // system message — no sender
            recipient_id:    recipientId,
            store_id,
            message:         fullMessage,
          });
        }

        // ── 2. Push notification via Expo ──────────────────────────────────────
        const pushToken = profile.expo_push_token;
        if (pushToken?.startsWith("ExponentPushToken[")) {
          const pushRes = await fetch(EXPO_PUSH_URL, {
            method:  "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body:    JSON.stringify({
              to:        pushToken,
              title:     alertTitle,
              body:      `${issues.length} issue${issues.length !== 1 ? "s" : ""} still open — tap to view`,
              sound:     "default",
              data:      { type: "compliance_alert", store_id, session_id: sessionId },
              channelId: "default",
            }),
          });
          const pushJson = await pushRes.json();
          console.log(`[compliance-alert] push to ${profile.full_name}:`, JSON.stringify(pushJson));
        } else {
          console.log(`[compliance-alert] no push token for ${profile.full_name}`);
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    console.error("[compliance-alert] fatal error:", e);
    return new Response(String(e), { status: 500 });
  }
});
