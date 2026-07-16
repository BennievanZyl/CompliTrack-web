import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const AWS_REGION = Deno.env.get("AWS_REGION") || "eu-west-1";
const AWS_ACCESS_KEY = Deno.env.get("AWS_ACCESS_KEY_ID")!;
const AWS_SECRET_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function hmac(key: ArrayBuffer | string, data: string): Promise<ArrayBuffer> {
  const k = typeof key === "string" ? new TextEncoder().encode(key) : new Uint8Array(key);
  const ck = await crypto.subtle.importKey("raw", k, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", ck, new TextEncoder().encode(data));
}

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function sha256(data: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data)));
}

async function rekognition(action: string, body: object) {
  const url = `https://rekognition.${AWS_REGION}.amazonaws.com/`;
  const bodyStr = JSON.stringify(body);
  const now = new Date();
  const dateStr = now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  const shortDate = dateStr.slice(0, 8);
  const payloadHash = await sha256(bodyStr);
  const canonicalReq = [
    "POST", "/", "",
    `content-type:application/x-amz-json-1.1`,
    `host:rekognition.${AWS_REGION}.amazonaws.com`,
    `x-amz-date:${dateStr}`,
    `x-amz-target:RekognitionService.${action}`,
    "",
    "content-type;host;x-amz-date;x-amz-target",
    payloadHash
  ].join("\n");
  const credScope = `${shortDate}/${AWS_REGION}/rekognition/aws4_request`;
  const strToSign = `AWS4-HMAC-SHA256\n${dateStr}\n${credScope}\n${await sha256(canonicalReq)}`;
  const sigKey = await hmac(await hmac(await hmac(await hmac(`AWS4${AWS_SECRET_KEY}`, shortDate), AWS_REGION), "rekognition"), "aws4_request");
  const signature = hex(await hmac(sigKey, strToSign));
  const auth = `AWS4-HMAC-SHA256 Credential=${AWS_ACCESS_KEY}/${credScope}, SignedHeaders=content-type;host;x-amz-date;x-amz-target, Signature=${signature}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Date": dateStr,
      "X-Amz-Target": `RekognitionService.${action}`,
      "Authorization": auth,
    },
    body: bodyStr,
  });
  return res.json();
}

serve(async (req) => {
  try {
    const { employee_id, store_id, photo_base64 } = await req.json();
    if (!employee_id || !store_id || !photo_base64) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
    }

    const collectionId = `complitrack-${store_id}`;

    // Create collection if needed
    try { await rekognition("CreateCollection", { CollectionId: collectionId }); } catch {}

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Remove old face if exists
    const { data: emp } = await sb.from("employees").select("face_descriptor").eq("id", employee_id).single();
    if (emp?.face_descriptor && typeof emp.face_descriptor === "string" && emp.face_descriptor.startsWith("aws:")) {
      try { await rekognition("DeleteFaces", { CollectionId: collectionId, FaceIds: [emp.face_descriptor.replace("aws:", "")] }); } catch {}
    }

    // Index face
    const imageBytes = Array.from(Uint8Array.from(atob(photo_base64), c => c.charCodeAt(0)));
    const result = await rekognition("IndexFaces", {
      CollectionId: collectionId,
      Image: { Bytes: imageBytes },
      ExternalImageId: employee_id,
      MaxFaces: 1,
      QualityFilter: "AUTO",
    });

    if (!result.FaceRecords?.length) {
      return new Response(JSON.stringify({ error: "No face detected. Use good lighting and face the camera directly." }), { status: 400 });
    }

    const faceId = result.FaceRecords[0].Face.FaceId;
    await sb.from("employees").update({ face_descriptor: `aws:${faceId}` }).eq("id", employee_id);

    return new Response(JSON.stringify({ ok: true, face_id: faceId }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
