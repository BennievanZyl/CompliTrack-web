import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const AWS_REGION = Deno.env.get("AWS_REGION") || "eu-west-1";
const AWS_ACCESS_KEY = Deno.env.get("AWS_ACCESS_KEY_ID")!;
const AWS_SECRET_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function signRequest(method: string, url: string, body: string) {
  const now = new Date();
  const dateStr = now.toISOString().replace(/[:-]|\.\d{3}/g, "").substring(0, 15) + "Z";
  const shortDate = dateStr.substring(0, 8);
  const host = new URL(url).hostname;
  const payloadHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body))
    .then(h => Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, "0")).join(""));
  const headers = `content-type:application/x-amz-json-1.1\nhost:${host}\nx-amz-date:${dateStr}\nx-amz-target:RekognitionService.${method}`;
  const signedHeaders = "content-type;host;x-amz-date;x-amz-target";
  const canonicalRequest = `POST\n${new URL(url).pathname}\n\n${headers}\n\n${signedHeaders}\n${payloadHash}`;
  const credentialScope = `${shortDate}/${AWS_REGION}/rekognition/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${dateStr}\n${credentialScope}\n` +
    Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalRequest)))).map(b => b.toString(16).padStart(2, "0")).join("");
  async function hmac(key: ArrayBuffer | string, data: string) {
    const k = typeof key === "string" ? new TextEncoder().encode(key) : key;
    const ck = await crypto.subtle.importKey("raw", k, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return crypto.subtle.sign("HMAC", ck, new TextEncoder().encode(data));
  }
  const sk = await hmac(await hmac(await hmac(await hmac(`AWS4${AWS_SECRET_KEY}`, shortDate), AWS_REGION), "rekognition"), "aws4_request");
  const sig = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", sk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), new TextEncoder().encode(stringToSign)))).map(b => b.toString(16).padStart(2, "0")).join("");
  return {
    "Content-Type": "application/x-amz-json-1.1",
    "X-Amz-Date": dateStr,
    "X-Amz-Target": `RekognitionService.${method}`,
    "Authorization": `AWS4-HMAC-SHA256 Credential=${AWS_ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${sig}`,
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
    const { store_id, photo_base64 } = await req.json();
    if (!store_id || !photo_base64) {
      return new Response(JSON.stringify({ error: "Missing store_id or photo" }), { status: 400 });
    }

    const collectionId = `complitrack-${store_id}`;
    const imageBytes = Uint8Array.from(atob(photo_base64), c => c.charCodeAt(0));

    const result = await rekognition("SearchFacesByImage", {
      CollectionId: collectionId,
      Image: { Bytes: Array.from(imageBytes) },
      MaxFaces: 1,
      FaceMatchThreshold: 90, // 90% confidence minimum
    });

    if (!result.FaceMatches || result.FaceMatches.length === 0) {
      return new Response(JSON.stringify({ matched: false }), { status: 200 });
    }

    const match = result.FaceMatches[0];
    const confidence = match.Similarity;
    const employeeId = match.Face.ExternalImageId;

    // Get employee details
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: employee } = await sb.from("employees")
      .select("id, full_name, position, store_id")
      .eq("id", employeeId)
      .single();

    if (!employee) {
      return new Response(JSON.stringify({ matched: false }), { status: 200 });
    }

    return new Response(JSON.stringify({
      matched: true,
      employee_id: employee.id,
      full_name: employee.full_name,
      position: employee.position,
      confidence: Math.round(confidence),
    }), { status: 200 });
  } catch (e) {
    console.error("[rekognition-identify]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
