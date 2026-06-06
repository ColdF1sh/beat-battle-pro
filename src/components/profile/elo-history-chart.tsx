"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type EloHistoryPoint = {
  label: string;
  elo: number;
  createdAt: string;
  modeName: string;
  result: string;
  placement: number;
  eloChange: number;
};

type EloHistoryChartProps = {
  data: EloHistoryPoint[];
  emptyMessage?: string;
};

function formatTooltipDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getPlacementLabel(placement: number) {
  if (placement === 1) return "1st";
  if (placement === 2) return "2nd";
  if (placement === 3) return "3rd";

  return `${placement}th`;
}

export function EloHistoryChart({
  data,
  emptyMessage = "Elo chart appears after ranked battles.",
}: EloHistoryChartProps) {
  if (data.length === 0) {
    return (
      <div className="bb-graffiti-texture flex min-h-56 items-center justify-center rounded-xl border border-dashed border-fuchsia-300/20 bg-black/30 text-sm text-zinc-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="bb-graffiti-texture h-64 rounded-xl border border-fuchsia-300/15 bg-black/30 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_34px_rgba(217,70,239,0.08)]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: 4, right: 12, top: 12, bottom: 4 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.075)" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "rgb(161 161 170)", fontSize: 12 }}
          />
          <YAxis
            width={44}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "rgb(161 161 170)", fontSize: 12 }}
          />
          <Tooltip
            cursor={{ stroke: "rgba(192,132,252,0.35)" }}
            content={({ active, payload }) => {
              const point = payload?.[0]?.payload as EloHistoryPoint | undefined;

              if (!active || !point) {
                return null;
              }

              return (
                <div className="rounded-lg border border-fuchsia-300/25 bg-zinc-950/95 p-3 text-xs text-zinc-200 shadow-2xl shadow-black/50">
                  <p className="font-black uppercase tracking-[0.14em] text-violet-100">
                    {point.label} · {formatTooltipDate(point.createdAt)}
                  </p>
                  <p className="mt-2 font-semibold text-white">{point.modeName}</p>
                  <p className="mt-1 text-zinc-300">
                    {point.result} · {getPlacementLabel(point.placement)}
                  </p>
                  <p className="mt-2 font-black text-white">
                    {point.eloChange >= 0 ? "+" : ""}
                    {point.eloChange} Elo · New {point.elo}
                  </p>
                </div>
              );
            }}
            contentStyle={{
              background: "rgba(9,9,11,0.96)",
              border: "1px solid rgba(217,70,239,0.24)",
              borderRadius: "10px",
              color: "white",
              boxShadow: "0 18px 48px rgba(0,0,0,0.42)",
            }}
            labelStyle={{ color: "rgb(216 180 254)" }}
          />
          <Line
            type="monotone"
            dataKey="elo"
            stroke="rgb(192,132,252)"
            strokeWidth={4}
            dot={{ r: 3, fill: "rgb(217,70,239)", strokeWidth: 0 }}
            activeDot={{ r: 6, fill: "rgb(217,70,239)", stroke: "rgb(255,255,255)", strokeWidth: 1 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
