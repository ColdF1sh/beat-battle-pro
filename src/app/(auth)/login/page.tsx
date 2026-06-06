"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { gameButtonClassName } from "@/components/ui/game-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginSchema } from "@/lib/validations/auth";

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      identifier: "",
      password: "",
    },
  });

  async function onSubmit(values: LoginFormValues) {
    setError(null);

    const result = await signIn("credentials", {
      identifier: values.identifier,
      password: values.password,
      redirect: false,
    });

    if (!result || result.error) {
      setError("Invalid email, username, or password.");
      return;
    }

    router.push("/battle");
    router.refresh();
  }

  return (
    <section className="bb-panel bb-editorial-panel bb-graffiti-texture relative overflow-hidden rounded-2xl border-fuchsia-300/20 p-5 shadow-2xl shadow-black/60 sm:p-6">
      <div className="pointer-events-none absolute right-0 top-0 h-20 w-20 border-r-2 border-t-2 border-fuchsia-300/30" />
      <div className="mb-6">
        <p className="bb-tag-label inline-flex -skew-x-6 border border-fuchsia-300/25 bg-fuchsia-300/10 px-2 py-1 text-xs text-fuchsia-100">
          Beat Battle Pro
        </p>
        <h1 className="bb-street-title mt-3 text-5xl text-white">
          Log in
        </h1>
        <p className="mt-2 text-sm font-semibold text-zinc-400">
          Enter the room. Keep the volume dangerous.
        </p>
      </div>
      <form
        className="space-y-4"
        data-testid="login-form"
        onSubmit={handleSubmit(onSubmit)}
      >
          <div className="space-y-2">
            <Label htmlFor="identifier" className="text-zinc-200">
              Email or username
            </Label>
            <Input
              id="identifier"
              data-testid="login-identifier"
              autoComplete="username"
              placeholder="test_user"
              aria-invalid={Boolean(errors.identifier)}
              className="h-11 rounded-lg border-white/10 bg-black/35 text-white placeholder:text-zinc-500 focus-visible:ring-fuchsia-300/40"
              {...register("identifier")}
            />
            {errors.identifier ? (
              <p className="text-sm text-rose-300">
                {errors.identifier.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-zinc-200">
              Password
            </Label>
            <Input
              id="password"
              data-testid="login-password"
              type="password"
              autoComplete="current-password"
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
            data-testid="login-submit"
            className={gameButtonClassName("primary", "mt-2 w-full")}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Logging in..." : "Log in"}
          </button>
      </form>

      <p className="mt-5 text-center text-sm text-zinc-400">
        New to Beat Battle Pro?{" "}
        <Link
          className="font-bold text-fuchsia-200 hover:text-white"
          href="/register"
        >
          Create an account
        </Link>
      </p>
    </section>
  );
}
