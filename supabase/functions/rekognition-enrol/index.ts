import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const AWS_REGION = Deno.env.get("AWS_REGION") || "eu-west-1";
const AWS_ACCESS_KEY = Deno.env.get("AWS_ACCESS_KEY_ID")!;
const AWS_SECRET_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// AWS Signature V4 helper
async function signRequest(method: string, url: string, body: string, service = "rekognition") {
  const now = new Date();
  const dateStr = now.toISOString().replace(/[:-]|\.\d{3}/g, "").substring(0, 15) + "Z";
  const shortDate = dateStr.substring(0, 8);
  const host = new URL(url).hostname;
  const canonicalUri = new URL(url).pathname;

  const payloadHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body))
    .then(h => Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, "0")).join(""));

  const headers = `content-type:application/x-amz-json-1.1\nhost:${host}\nx-amz-date:${dateStr}\nx-amz-target:RekognitionService.${method}`;
  const signedHeaders = "content-type;host;x-amz-date;x-amz-target";
  const canonicalRequest = `POST\n${canonicalUri}\n\n${headers}\n\n${signedHeaders}\n${payloadHash}`;
  const credentialScope = `${shortDate}/${AWS_REGION}/${service}/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${dateStr}\n${credentialScope}\n` +
    Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalRequest)))).map(b => b.toString(16).padStart(2, "0")).join("");

  async function hmac(key: ArrayBuffer | string, data: string) {
    const k = typeof key === "string" ? new TextEncoder().encode(key) : key;
    const cryptoKey = await crypto.subtle.importKey("raw", k, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
  }
  const signingKey = await hmac(await hmac(await hmac(await hmac(`AWS4${AWS_SECRET_KEY}`, shortDate), AWS_REGION), service), "aws4_request");
  const signature = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", signingKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), new TextEncoder().encode(stringToSign)))).map(b => b.toString(16).padStart(2, "0")).join("");

  return {
    "Content-Type": "application/x-amz-json-1.1",
    "X-Amz-Date": dateStr,
    "X-Amz-Target": `RekognitionService.${method}`,
    "Authorization": `AWS4-HMAC-SHA256 Credential=${AWS_ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

async function rekognition(method: string, body: object) {
  const url = `https://rekognition.${AWS_REGION}.amazonaws.com/`;
  const bodyStr = JSON.stringify(body);
  const headers = await signRequest(method, url, bodyStr);
  const res = await fetch(url, { method: "POST", headers, body: bodyStr });
  return res.json();
}

serve(async (req) => {
  try {
    const { employee_id, store_id, photo_base64 } = await req.json();
    if (!employee_id || !store_id || !photo_base64) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
    }

    const collectionId = `complitrack-${store_id}`;

    // Create collection if it doesn't exist
    try {
      await rekognition("CreateCollection", { CollectionId: collectionId });
    } catch { /* Collection may already exist */ }

    // Remove any existing face for this employee
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: emp } = await sb.from("employees").select("face_descriptor").eq("id", employee_id).single();
    if (emp?.face_descriptor && typeof emp.face_descriptor === "string" && emp.face_descriptor.startsWith("aws:")) {
      const oldFaceId = emp.face_descriptor.replace("aws:", "");
      await rekognition("DeleteFaces", { CollectionId: collectionId, FaceIds: [oldFaceId] });
    }

    // Index the new face
    const imageBytes = Uint8Array.from(atob(photo_base64), c => c.charCodeAt(0));
    const result = await rekognition("IndexFaces", {
      CollectionId: collectionId,
      Image: { Bytes: Array.from(imageBytes) },
      ExternalImageId: employee_id,
      MaxFaces: 1,
      QualityFilter: "AUTO",
    });

    if (!result.FaceRecords || result.FaceRecords.length === 0) {
      return new Response(JSON.stringify({ error: "No face detected in photo. Please retake." }), { status: 400 });
    }

    const faceId = result.FaceRecords[0].Face.FaceId;

    // Store AWS FaceId in employee record
    await sb.from("employees").update({ face_descriptor: `aws:${faceId}` }).eq("id", employee_id);

    return new Response(JSON.stringify({ ok: true, face_id: faceId }), { status: 200 });
  } catch (e) {
    console.error("[rekognition-enrol]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
