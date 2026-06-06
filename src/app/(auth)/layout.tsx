import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="bb-client-bg bb-grid-overlay bb-graffiti-texture bb-concrete min-h-screen overflow-hidden text-white">
      <div className="relative flex min-h-screen items-center justify-center px-4 py-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[linear-gradient(180deg,rgba(217,70,239,0.16),transparent)]" />
        <div className="pointer-events-none absolute bottom-6 left-6 hidden max-w-xs -rotate-2 border-l-2 border-fuchsia-300/30 pl-4 text-[10px] font-black uppercase tracking-[0.22em] text-fuchsia-100/55 md:block">
          Ranked access
        </div>
        <div className="relative z-10 w-full max-w-[27rem]">{children}</div>
      </div>
    </main>
  );
}
