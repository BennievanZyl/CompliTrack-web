import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

serve(async (req) => {
  try {
    const payload = await req.json();
    const record = payload.record;
    if (!record) return new Response("no record", { status: 200 });

    const { recipient_id, sender_id, message, conversation_id } = record;
    if (!recipient_id || !sender_id || recipient_id === sender_id) {
      return new Response("skipped", { status: 200 });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Get recipient's push token and sender's name
    const [{ data: recipient }, { data: sender }] = await Promise.all([
      sb.from("profiles").select("expo_push_token, full_name").eq("id", recipient_id).single(),
      sb.from("profiles").select("full_name").eq("id", sender_id).single(),
    ]);

    const pushToken = recipient?.expo_push_token;
    if (!pushToken || !pushToken.startsWith("ExponentPushToken[")) {
      return new Response("no push token", { status: 200 });
    }

    const senderName = sender?.full_name ?? "CompliTrack";
    const isPhoto = message?.startsWith("[PHOTO]:");
    const body = isPhoto
      ? "📷 Shared a compliance photo"
      : message?.length > 100 ? message.slice(0, 97) + "…" : message;

    // Send via Expo Push API
    const pushRes = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        to: pushToken,
        title: senderName,
        body,
        sound: "default",
        data: { conversation_id, type: "chat_message" },
        channelId: "default",
      }),
    });

    const pushJson = await pushRes.json();
    console.log("[notify-chat] push result:", JSON.stringify(pushJson));
    return new Response(JSON.stringify({ ok: true, push: pushJson }), { status: 200 });
  } catch (e) {
    console.error("[notify-chat] error:", e);
    return new Response(String(e), { status: 500 });
  }
});
