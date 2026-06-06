import {
  MegaphoneIcon,
  MessageSquareIcon,
  NewspaperIcon,
  RadioTowerIcon,
} from "lucide-react";

const communityPanels = [
  {
    title: "Posts",
    description: "Room clips and producer drops.",
    icon: MessageSquareIcon,
    accent: "border-cyan-300/20 bg-cyan-300/10 text-cyan-100",
  },
  {
    title: "News",
    description: "Platform drops.",
    icon: NewspaperIcon,
    accent: "border-violet-300/20 bg-violet-300/10 text-violet-100",
  },
  {
    title: "Announcements",
    description: "Battles and events.",
    icon: MegaphoneIcon,
    accent: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
  },
];

export default function CommunityPage() {
  return (
    <section className="space-y-4">
      <div className="bb-panel bb-editorial-panel relative overflow-hidden rounded-2xl p-4 sm:p-5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(34,211,238,0.14),transparent_34%),radial-gradient(circle_at_82%_12%,rgba(139,92,246,0.18),transparent_34%)]" />
        <div className="relative">
          <p className="bb-tag-label text-sm text-cyan-200">Community</p>
          <h1 className="bb-street-title mt-2 text-5xl text-white sm:text-6xl">
            Community
          </h1>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {communityPanels.map((item) => {
          const Icon = item.icon;

          return (
            <div key={item.title} className="bb-panel-soft bb-editorial-panel rounded-2xl p-4">
              <span
                className={`inline-flex size-11 items-center justify-center rounded-xl border ${item.accent}`}
              >
                <Icon className="size-5" />
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
          <RadioTowerIcon className="size-5 text-cyan-200" />
          <h2 className="bb-tag-label text-white">Activity Signal</h2>
        </div>
      </div>
    </section>
  );
}
