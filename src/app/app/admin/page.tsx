import { AdminCreditConsole } from "@/components/admin-credit-console";
import { requirePlatformAdmin } from "@/lib/auth";

export default async function AdminPage() {
  await requirePlatformAdmin();
  return <AdminCreditConsole />;
}
