const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL as string || 'https://ukhbszmytstnigbnhuml.supabase.co';
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVraGJzem15dHN0bmlnYm5odW1sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE5MDgxNzMsImV4cCI6MjA3NzQ4NDE3M30.TWsSrKG5EJHkoR-TfmdpPcUMh40tF-HJNqPyNW6AVRU';

const BASE = `${SUPABASE_URL}/functions/v1`;
const HEADERS = { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON };

export async function getAgentMode(mainId: string): Promise<'auto' | 'off'> {
  try {
    const r = await fetch(`${BASE}/agent-mode?lead_id=${encodeURIComponent(mainId)}`, { headers: HEADERS });
    if (!r.ok) return 'auto';
    const data = await r.json();
    return data.mode === 'off' ? 'off' : 'auto';
  } catch {
    return 'auto';
  }
}

export async function setAgentMode(mainId: string, mode: 'auto' | 'off', reason?: string): Promise<void> {
  await fetch(`${BASE}/agent-mode`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ lead_id: mainId, mode, reason }),
  });
}

export async function callLucyChat(
  orderId: string,
  question: string,
  managerId: number,
): Promise<string> {
  const r = await fetch(`${BASE}/lucy-chat`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ order_id: orderId, question, manager_id: managerId }),
  });
  if (!r.ok) throw new Error(`Lucy error: ${r.status}`);
  const data = await r.json();
  return data.answer as string;
}
