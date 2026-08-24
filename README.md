# English Arabic Translate AI

A production-oriented free-beta implementation of an English ↔ Arabic document translation SaaS. It uses Next.js App Router, Supabase Auth/Postgres/Storage, OpenAI Responses, and Vercel Workflow. The public beta has no checkout: each verified account receives one non-renewing 5,000 source-word grant, and platform administrators can issue audited manual grants.

Translations are AI-assisted professional drafts and are not legally certified.

## Included

- Responsive bilingual interface, full RTL/LTR switching, light/dark themes, keyboard-visible controls, and reduced-motion behavior.
- Email magic-link, Google, and Microsoft Entra authentication through Supabase.
- Personal and organization workspaces with Owner, Admin, Translator, and Reviewer roles.
- Text, DOCX, digital/scanned PDF, JPG/PNG, scan, and mobile camera inputs.
- Signature, size, encryption, corruption, and macro checks before processing.
- OpenAI vision OCR with structured blocks, confidence, reading order, and correction gates.
- Durable segment translation, cancellation, failed-segment retry, QA flags, and layout warnings.
- Side-by-side source/translation editing, revisions, assignments, comments, review, and approval.
- Structure-preserving DOCX export, source-page-preserving PDF export, and text export.
- Private workspace glossaries and translation memory; global learning consent is off by default.
- Atomic credit reservation/settlement and audited administrator grants.
- Versioned `/api/v1` endpoints, an OpenAPI contract, and generated TypeScript client types.

No Noqoody, card, subscription, payment callback, Namecheap, or custom-domain code is included in this beta.

## Local setup

Requirements: Node.js 22+, Docker Desktop, and the Supabase CLI.

```powershell
npm install
npx supabase start
Copy-Item .env.example .env.local
```

Run `npx supabase status -o env` and map the local values into `.env.local`:

- `API_URL` → `NEXT_PUBLIC_SUPABASE_URL`
- `PUBLISHABLE_KEY` → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SECRET_KEY` → `SUPABASE_SECRET_KEY`
- `DB_URL` → `SUPABASE_DATABASE_URL`

Add a valid OpenAI project key, keep the two model variables configurable, then run:

```powershell
npm run dev
```

The app is at `http://localhost:3000`; local Supabase Studio is at `http://127.0.0.1:54523`.

## Runtime credentials

Set these in `.env.local` and in Vercel's Development, Preview, and Production environments:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
SUPABASE_DATABASE_URL
OPENAI_API_KEY
OPENAI_MODEL_TRANSLATION=gpt-5.6-terra
OPENAI_MODEL_OCR=gpt-5.6-terra
APP_URL=https://your-assigned-project.vercel.app
PLATFORM_ADMIN_EMAILS=admin@example.com
RATE_LIMIT_SALT=<at-least-32-random-characters>
```

Only the two `NEXT_PUBLIC_` variables may reach the browser. Supabase secret/database credentials and the OpenAI key must remain server-only. MCP credentials are not runtime variables: MCPs are optional development tools and are not bundled into the deployment.

## Supabase production setup

1. Create a Supabase project in Mumbai and record its URL, publishable key, secret key, and direct database URL.
2. Link and apply the migration:

   ```powershell
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```

3. In Authentication → URL Configuration, set the Site URL to the assigned Vercel production URL. Add the exact local, preview, and production `/auth/callback` URLs as allowed redirects.
4. Enable Google and Azure providers in Supabase. In each provider console, use Supabase's callback URL: `https://<project-ref>.supabase.co/auth/v1/callback`.
5. For Microsoft Entra, configure the application ID, secret, and intended tenant policy in Supabase. The app requests the email scope.
6. Confirm the private `documents` Storage bucket and policies were created by the migration.

All tenant records contain `workspace_id`. Exposed tables use explicit grants, forced RLS, and indexed membership checks. Seed memory and evaluation data have no authenticated grants; evaluation rows are never loaded by the translation workflow.

## Import the human-translated corpus

The importer accepts aligned DOCX or UTF-8 text files. It refuses mismatched paragraph counts, duplicates, or extreme length mismatches. First run a preview and manually compare the aligned blocks:

```powershell
npm run corpus:import -- --source="C:\data\source.docx" --target="C:\data\translated.docx" --direction=en-ar --name="Approved corpus v1"
```

After manual validation, rerun with `--approve`. A deterministic 20% is isolated in `evaluation_segments`; the other 80% enters server-only global translation memory.

```powershell
npm run corpus:import -- --source="C:\data\source.docx" --target="C:\data\translated.docx" --direction=en-ar --name="Approved corpus v1" --approve
```

Approved user corrections remain private to their workspace. Consent alone does not publish them: global candidates also require de-identification and manual approval. Fine-tuning is intentionally absent from the beta.

## Deploy to the Vercel domain

The project targets Node.js 22 and Vercel region `dxb1` through `vercel.json`. Create/link a Vercel project, add the environment variables, and deploy:

```powershell
npx vercel link
npx vercel
npx vercel --prod
```

The first production deployment supplies the included `*.vercel.app` address. Put that exact HTTPS URL into `APP_URL` and Supabase Auth redirects, then redeploy. The authenticated product is under `/app`; the API is under `/api/v1`; the machine-readable contract is available at `/api/v1/openapi` and in `openapi/openapi.yaml`.

Do not add a Namecheap domain or Noqoody variables yet. Billing should be a separate milestone after current merchant documentation, recurring-billing access, credentials, callbacks, and reconciliation behavior are known.

## Verification

```powershell
npm test
npm run typecheck
npm run lint
npm run build
npm audit
npx supabase db lint --local --fail-on warning
npx supabase db advisors --local --fail-on warn
```

`npm run verify:local-db` additionally creates disposable local users and verifies one-time provisioning, the 5,000-credit grant, atomic overspend protection, partial settlement, cross-workspace RLS, and evaluation-holdout privacy. It has a hard safety check and refuses non-local Supabase hosts.

Real-provider acceptance still requires your Supabase/OAuth/OpenAI credentials and the two human-reviewed parallel documents. Before inviting beta users, test both translation directions across text, DOCX, digital PDF, scans, images, and a real phone camera; then score the held-out corpus for adequacy, fluency, terminology, names, and numbers.

## Key paths

- `supabase/migrations/20260823203156_initial_beta_schema.sql` — schema, RLS, Storage, credits, consent, and audit rules.
- `src/workflows/translation.ts` — durable contextual translation and settlement workflow.
- `src/lib/openai/responses-provider.ts` — server-held OpenAI adapter with `store: false`.
- `src/lib/documents` — validation and canonical DOCX/PDF/text extraction.
- `src/lib/exports.ts` — DOCX/PDF/text reconstruction.
- `openapi/openapi.yaml` — native-client API contract.
- `scripts/import-parallel-corpus.ts` — approved 80/20 corpus import.
- `scripts/verify-local-beta.ts` — destructive-safe local database acceptance smoke test.
