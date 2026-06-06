"use client";

import { useMemo, useState } from "react";

import { EloHistoryChart } from "@/components/profile/elo-history-chart";
import { cn } from "@/lib/utils";

type EloHistoryPoint = {
  label: string;
  elo: number;
};

type EloTrajectoryPanelProps = {
  producerData: EloHistoryPoint[];
  rapData: EloHistoryPoint[];
};

const tabs = [
  {
    id: "producer",
    label: "Producer Elo",
    emptyMessage: "Qualification not completed",
  },
  {
    id: "rap",
    label: "Rap Elo",
    emptyMessage: "No ranked rap battles yet",
  },
] as const;

type TabId = (typeof tabs)[number]["id"];

export function EloTrajectoryPanel({
  producerData,
  rapData,
}: EloTrajectoryPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>("producer");
  const activeData = useMemo(
    () => (activeTab === "producer" ? producerData : rapData),
    [activeTab, producerData, rapData],
  );
  const activeEmptyMessage =
    tabs.find((tab) => tab.id === activeTab)?.emptyMessage ??
    "Qualification not completed";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "border px-3 py-2 text-xs font-black uppercase tracking-[0.16em] transition-[transform,background,border-color]",
                isActive
                  ? "border-violet-300/45 bg-violet-400/[0.18] text-violet-100"
                  : "border-white/10 bg-black/25 text-zinc-400 hover:-translate-y-0.5 hover:border-fuchsia-300/35 hover:text-white",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div className="transition-opacity duration-300">
        <EloHistoryChart
          data={activeData}
          emptyMessage={activeEmptyMessage}
        />
      </div>
    </div>
  );
}
