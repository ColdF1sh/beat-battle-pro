"use client";

import { signOut } from "next-auth/react";

import { Button } from "@/components/ui/button";

export function SignOutButton() {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="border-white/15 bg-white/5 text-zinc-100 hover:bg-white/10 hover:text-white"
    >
      Sign out
    </Button>
  );
}
