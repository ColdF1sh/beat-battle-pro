import type { ReactNode } from "react";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { GameClientShell } from "@/components/layout/game-client-shell";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  noStore();

  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return <GameClientShell user={user}>{children}</GameClientShell>;
}
