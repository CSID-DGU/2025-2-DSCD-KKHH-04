export async function postIngest(payload: unknown) {
  const url = `${import.meta.env.VITE_API_BASE_URL}/api/ingest/`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Ingest failed: ${res.status}`);
  return res.json() as Promise<{ gloss: string; text: string }>;
}