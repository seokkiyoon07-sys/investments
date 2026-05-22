import { createClient } from '@supabase/supabase-js';
import { loadDotEnv } from './lib-env.mjs';

export function createSupabaseAdmin() {
  loadDotEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

export async function upsertInChunks(supabase, table, rows, options = {}) {
  const chunkSize = options.chunkSize || 1000;
  const onConflict = options.onConflict;
  let written = 0;

  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const { error } = await supabase
      .from(table)
      .upsert(chunk, onConflict ? { onConflict } : undefined);

    if (error) throw new Error(`${table} upsert failed: ${error.message}`);
    written += chunk.length;
    console.log(`${table}: upserted ${written}/${rows.length}`);
  }

  return written;
}
