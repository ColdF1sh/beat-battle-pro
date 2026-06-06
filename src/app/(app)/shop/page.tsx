import {
  Disc3Icon,
  Music2Icon,
  PackageIcon,
  PlugIcon,
  ShoppingBagIcon,
  SparklesIcon,
} from "lucide-react";

const featuredPacks = [
  {
    title: "Drum packs",
    description: "One-shots and kits.",
    icon: Disc3Icon,
  },
  {
    title: "Loop packs",
    description: "Melodies and loops.",
    icon: Music2Icon,
  },
  {
    title: "Plugins",
    description: "Tools and effects.",
    icon: PlugIcon,
  },
];

export default function ShopPage() {
  return (
    <section className="space-y-4">
      <div className="bb-panel bb-editorial-panel relative overflow-hidden rounded-2xl p-4 sm:p-5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(139,92,246,0.18),transparent_34%),radial-gradient(circle_at_82%_10%,rgba(52,211,153,0.1),transparent_34%)]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="bb-tag-label text-sm text-violet-200">Shop</p>
            <h1 className="bb-street-title mt-2 text-5xl text-white sm:text-6xl">
              Loadout
            </h1>
          </div>
          <div className="bb-panel-soft rounded-lg px-3 py-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-white">
              <SparklesIcon className="size-4 text-cyan-200" />
              Featured packs
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {featuredPacks.map((item) => {
          const Icon = item.icon;

          return (
            <div key={item.title} className="bb-panel-soft bb-editorial-panel rounded-2xl p-4">
              <span className="inline-flex size-12 items-center justify-center rounded-xl border border-violet-300/20 bg-violet-400/10 text-violet-100">
                <Icon className="size-6" />
              </span>
              <h2 className="bb-tag-label mt-4 text-lg text-white">
                {item.title}
              </h2>
              <p className="bb-text-muted mt-2 text-sm leading-6">
                {item.description}
              </p>
            </div>
          );
        })}
      </div>

      <div className="bb-panel-soft bb-editorial-panel rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <ShoppingBagIcon className="size-5 text-violet-200" />
          <h2 className="bb-tag-label text-white">Marketplace</h2>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {["New packs", "Top creators", "Recent drops"].map((label) => (
            <div
              key={label}
              className="rounded-xl border border-white/10 bg-black/25 p-4"
            >
              <PackageIcon className="size-5 text-cyan-200" />
              <p className="mt-3 text-sm font-semibold text-white">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
