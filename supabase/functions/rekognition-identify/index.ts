import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VISION_API_KEY = Deno.env.get("GOOGLE_VISION_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VISION_URL = `https://vision.googleapis.com/v1/images:annotate?key=${VISION_API_KEY}`;

function euclidean(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return Infinity;
  return Math.sqrt(a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0));
}

serve(async (req) => {
  try {
    const { store_id, photo_base64 } = await req.json();
    if (!store_id || !photo_base64) {
      return new Response(JSON.stringify({ error: "Missing store_id or photo" }), { status: 400 });
    }

    // Detect face in the photo
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
      return new Response(JSON.stringify({ matched: false, reason: "No face detected" }), { status: 200 });
    }

    const face = faces[0];
    const landmarks = face.landmarks || [];
    const boundingBox = face.boundingPoly?.vertices || [];
    const w = (boundingBox[1]?.x || 1) - (boundingBox[0]?.x || 0);
    const h = (boundingBox[2]?.y || 1) - (boundingBox[0]?.y || 0);
    const x0 = boundingBox[0]?.x || 0;
    const y0 = boundingBox[0]?.y || 0;

    const probe = landmarks.map((lm: any) => [
      (lm.position.x - x0) / (w || 1),
      (lm.position.y - y0) / (h || 1),
      (lm.position.z || 0) / 100,
    ]).flat();

    if (probe.length === 0) {
      return new Response(JSON.stringify({ matched: false, reason: "No landmarks" }), { status: 200 });
    }

    // Load all enrolled employees for this store
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: employees } = await sb
      .from("employees")
      .select("id, full_name, position, face_descriptor")
      .eq("store_id", store_id)
      .not("face_descriptor", "is", null);

    if (!employees || employees.length === 0) {
      return new Response(JSON.stringify({ matched: false, reason: "No enrolled employees" }), { status: 200 });
    }

    // Find closest match
    let best: any = null;
    let bestDist = Infinity;
    for (const emp of employees) {
      if (!emp.face_descriptor || !Array.isArray(emp.face_descriptor)) continue;
      const dist = euclidean(probe, emp.face_descriptor);
      if (dist < bestDist) { bestDist = dist; best = emp; }
    }

    // Threshold: 0.4 = 60%+ match
    const THRESHOLD = 0.4;
    if (!best || bestDist > THRESHOLD) {
      return new Response(JSON.stringify({ matched: false, reason: "No match found", distance: bestDist }), { status: 200 });
    }

    const confidence = Math.round((1 - bestDist / THRESHOLD) * 100);
    return new Response(JSON.stringify({
      matched: true,
      employee_id: best.id,
      full_name: best.full_name,
      position: best.position,
      confidence,
    }), { status: 200 });
  } catch (e) {
    console.error("[face-identify]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
