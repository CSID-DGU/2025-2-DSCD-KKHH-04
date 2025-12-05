// src/services/api.ts
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

export async function postIngestAndInfer(payload: unknown) {
  const res = await fetch(`${API_BASE}/api/ingest-and-infer/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Ingest & Infer failed: ${res.status}`);
  }

  return res.json() as Promise<{
    ok: boolean;
    file: string;
    T: number;
    text: string;
    inference: {
      topk_tokens: string[];
      topk_ids: number[];
      topk_probs: number[];
      time_ms: number;
    };
  }>;
}
