"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { gameButtonClassName } from "@/components/ui/game-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerSchema } from "@/lib/validations/auth";

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      username: "",
      password: "",
    },
  });

  async function onSubmit(values: RegisterFormValues) {
    setError(null);

    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      setError(data?.error ?? "Registration failed. Please try again.");
      return;
    }

    router.push("/login");
  }

  return (
    <section className="bb-panel bb-editorial-panel bb-graffiti-texture relative overflow-hidden rounded-2xl border-fuchsia-300/20 p-5 shadow-2xl shadow-black/60 sm:p-6">
      <div className="pointer-events-none absolute right-0 top-0 h-20 w-20 border-r-2 border-t-2 border-violet-300/30" />
      <div className="mb-6">
        <p className="bb-tag-label inline-flex -skew-x-6 border border-violet-300/25 bg-violet-300/10 px-2 py-1 text-xs text-violet-100">
          Crew entry
        </p>
        <h1 className="bb-street-title mt-3 text-5xl text-white">
          Register
        </h1>
        <p className="mt-2 text-sm font-semibold text-zinc-400">
          Claim your tag before the next battle opens.
        </p>
      </div>
      <form
        className="space-y-4"
        data-testid="register-form"
        onSubmit={handleSubmit(onSubmit)}
      >
          <div className="space-y-2">
            <Label htmlFor="email" className="text-zinc-200">
              Email
            </Label>
            <Input
              id="email"
              data-testid="register-email"
              type="email"
              autoComplete="email"
              placeholder="test@example.com"
              aria-invalid={Boolean(errors.email)}
              className="h-11 rounded-lg border-white/10 bg-black/35 text-white placeholder:text-zinc-500 focus-visible:ring-fuchsia-300/40"
              {...register("email")}
            />
            {errors.email ? (
              <p className="text-sm text-rose-300">{errors.email.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="username" className="text-zinc-200">
              Username
            </Label>
            <Input
              id="username"
              data-testid="register-username"
              autoComplete="username"
              placeholder="test_user"
              aria-invalid={Boolean(errors.username)}
              className="h-11 rounded-lg border-white/10 bg-black/35 text-white placeholder:text-zinc-500 focus-visible:ring-fuchsia-300/40"
              {...register("username")}
            />
            {errors.username ? (
              <p className="text-sm text-rose-300">{errors.username.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-zinc-200">
              Password
            </Label>
            <Input
              id="password"
              data-testid="register-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.password)}
              className="h-11 rounded-lg border-white/10 bg-black/35 text-white placeholder:text-zinc-500 focus-visible:ring-fuchsia-300/40"
              {...register("password")}
            />
            {errors.password ? (
              <p className="text-sm text-rose-300">{errors.password.message}</p>
            ) : null}
          </div>

          {error ? (
            <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            data-testid="register-submit"
            className={gameButtonClassName("danger", "mt-2 w-full")}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Creating account..." : "Create account"}
          </button>
      </form>

      <p className="mt-5 text-center text-sm text-zinc-400">
        Already have an account?{" "}
        <Link className="font-bold text-fuchsia-200 hover:text-white" href="/login">
          Log in
        </Link>
      </p>
    </section>
  );
}
