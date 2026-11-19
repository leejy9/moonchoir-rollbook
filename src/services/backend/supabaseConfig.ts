export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const supaUrl =
    (typeof import.meta !== 'undefined' && import.meta.env
      ? import.meta.env.VITE_SUPABASE_URL
      : undefined) || 'https://hvsftdbqwxjbpfogoldw.supabase.co';
  const supaKey =
    (typeof import.meta !== 'undefined' && import.meta.env
      ? import.meta.env.VITE_SUPABASE_ANON_KEY
      : undefined) ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2c2Z0ZGJxd3hqYnBmb2dvbGR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUwNDk2NjksImV4cCI6MjExMDYyNTY2OX0.Pg5U9ger1SD9mrjmKf404--AkKF5RRfU2E7va5EepjQ';

  if (!supaUrl || !supaKey) return null;
  return { url: supaUrl, anonKey: supaKey };
}
