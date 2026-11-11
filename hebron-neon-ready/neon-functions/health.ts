// Neon Functions use a long-lived Node process. Official guidance recommends
// a module-scope pg Pool rather than the HTTP serverless driver here.
import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
export default async function health(_request: Request): Promise<Response> {
  try {
    const result = await pool.query('SELECT CURRENT_TIMESTAMP AS checked_at');
    return Response.json({ ok: true, postgres: true, checked_at: result.rows[0].checked_at });
  } catch (_err) {
    return Response.json({ ok: false, postgres: false }, { status: 503 });
  }
}
