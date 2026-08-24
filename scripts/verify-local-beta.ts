import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function personalWorkspace(client: SupabaseClient) {
  const { data, error } = await client.from("workspace_members").select("workspace_id,workspaces!inner(kind)").eq("role", "owner");
  if (error) throw error;
  const row = data.find((item) => (item.workspaces as unknown as { kind: string }).kind === "personal");
  assert(row, "Personal workspace was not provisioned.");
  return row.workspace_id;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !publishableKey || !secretKey) throw new Error("Local Supabase environment variables are required.");
  const host = new URL(url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") throw new Error("Safety stop: this verification script runs only against local Supabase.");

  const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const suffix = crypto.randomUUID().slice(0, 8);
  const password = `Beta-${crypto.randomUUID()}!`;
  const emails = [`credit-${suffix}@example.test`, `isolation-${suffix}@example.test`];
  const ids: string[] = [];
  try {
    for (const email of emails) {
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw error;
      ids.push(data.user.id);
    }
    const clients = await Promise.all(emails.map(async (email) => {
      const client = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return client;
    }));
    // Docker Desktop can trail the host clock by a fraction of a second immediately after issuing a local JWT.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const [firstWorkspace, secondWorkspace] = await Promise.all(clients.map(personalWorkspace));

    const { data: account } = await clients[0].from("credit_accounts").select("balance,reserved").eq("workspace_id", firstWorkspace).single();
    assert(account?.balance === 5000 && account.reserved === 0, "Verified user did not receive exactly 5,000 available credits.");
    const { data: grants } = await clients[0].from("credit_ledger").select("id").eq("entry_type", "beta_grant");
    assert(grants?.length === 1, "Beta grant was not recorded exactly once.");

    const { data: leaked } = await clients[0].from("workspaces").select("id").eq("id", secondWorkspace);
    assert(leaked?.length === 0, "RLS exposed another user's workspace.");
    const { error: evaluationError } = await clients[0].from("evaluation_segments").select("id").limit(1);
    assert(evaluationError, "Evaluation holdout is unexpectedly readable by an authenticated user.");

    const { data: project, error: projectError } = await clients[0].from("projects").insert({ workspace_id: firstWorkspace, created_by: ids[0], title: "Credit concurrency test", direction: "en-ar" }).select("id").single();
    if (projectError) throw projectError;
    const { data: jobs, error: jobError } = await clients[0].from("translation_jobs").insert([
      { workspace_id: firstWorkspace, project_id: project.id, created_by: ids[0], idempotency_key: `first-${suffix}`, source_word_count: 3000 },
      { workspace_id: firstWorkspace, project_id: project.id, created_by: ids[0], idempotency_key: `second-${suffix}`, source_word_count: 3000 },
    ]).select("id");
    if (jobError) throw jobError;
    const firstReserve = await clients[0].rpc("reserve_credits", { p_workspace_id: firstWorkspace, p_job_id: jobs[0].id, p_amount: 3000 });
    assert(!firstReserve.error, "First credit reservation failed.");
    const secondReserve = await clients[0].rpc("reserve_credits", { p_workspace_id: firstWorkspace, p_job_id: jobs[1].id, p_amount: 3000 });
    assert(secondReserve.error, "Concurrent jobs were able to overspend credits.");

    const settlement = await admin.rpc("commit_credits", { p_job_id: jobs[0].id, p_successful_words: 1000 });
    assert(!settlement.error && settlement.data === 4000, "Partial credit settlement did not return unused credits.");
    const { error: updateError } = await admin.auth.admin.updateUserById(ids[0], { user_metadata: { full_name: "Provisioning retry" } });
    if (updateError) throw updateError;
    const { data: finalGrants, error: finalGrantError } = await admin.from("credit_ledger").select("id").eq("workspace_id", firstWorkspace).eq("entry_type", "beta_grant");
    if (finalGrantError) throw finalGrantError;
    assert(finalGrants.length === 1, `An auth update left ${finalGrants.length} beta grants instead of one.`);

    console.log("Local beta database verification passed: provisioning, 5,000-credit idempotency, atomic reservations, partial settlement, RLS isolation, and evaluation holdout privacy.");
  } finally {
    for (const id of ids.reverse()) await admin.auth.admin.deleteUser(id);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
