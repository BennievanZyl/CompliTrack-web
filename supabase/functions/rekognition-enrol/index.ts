import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VISION_API_KEY = Deno.env.get("GOOGLE_VISION_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VISION_URL = `https://vision.googleapis.com/v1/images:annotate?key=${VISION_API_KEY}`;

serve(async (req) => {
  try {
    const { employee_id, store_id, photo_base64 } = await req.json();
    if (!employee_id || !photo_base64) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
    }

    // Call Google Vision API to detect face landmarks
    const visionRes = await fetch(VISION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{
          image: { content: photo_base64 },
          features: [{ type: "FACE_DETECTION", maxResults: 1 }],
        }],
      }),
    });

    const visionData = await visionRes.json();
    const faces = visionData.responses?.[0]?.faceAnnotations;

    if (!faces || faces.length === 0) {
      return new Response(JSON.stringify({ error: "No face detected in photo. Please retake in good lighting." }), { status: 400 });
    }

    const face = faces[0];

    // Build a descriptor from face landmarks (normalized positions)
    const landmarks = face.landmarks || [];
    const boundingBox = face.boundingPoly?.vertices || [];
    const w = (boundingBox[1]?.x || 1) - (boundingBox[0]?.x || 0);
    const h = (boundingBox[2]?.y || 1) - (boundingBox[0]?.y || 0);
    const x0 = boundingBox[0]?.x || 0;
    const y0 = boundingBox[0]?.y || 0;

    // Normalise landmark positions relative to face bounding box
    const descriptor = landmarks.map((lm: any) => [
      (lm.position.x - x0) / (w || 1),
      (lm.position.y - y0) / (h || 1),
      (lm.position.z || 0) / 100,
    ]).flat();

    // Also store photo for visual reference
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    await sb.from("employees").update({
      face_descriptor: descriptor,
    }).eq("id", employee_id);

    return new Response(JSON.stringify({
      ok: true,
      landmarks_count: landmarks.length,
      confidence: face.detectionConfidence,
    }), { status: 200 });
  } catch (e) {
    console.error("[face-enrol]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
