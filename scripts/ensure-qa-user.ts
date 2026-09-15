import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) throw new Error("Missing Supabase env");

const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
const email = "qa-agent@onesmartbiz.pro";
const password = "Qa-Agent-2026!x";

async function main() {
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = list?.users.find((user) => user.email === email);
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
    if (error) throw error;
    console.log("QA_USER_RESET", existing.id);
  } else {
    const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    console.log("QA_USER_CREATED", created.user?.id);
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
