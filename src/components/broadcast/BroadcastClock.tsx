"use client";

import { useEffect, useState } from "react";

const TZ = "Asia/Kolkata";

function istParts(d: Date) {
  const time = d
    .toLocaleTimeString("en-IN", {
      timeZone: TZ,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    })
    .toUpperCase();
  const date = d.toLocaleDateString("en-IN", {
    timeZone: TZ,
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return { time, date };
}

/** Live IST wall clock — ticks every second so the stream never looks frozen. */
export function BroadcastClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const { time, date } = now ? istParts(now) : { time: "--:--:--", date: "" };

  return (
    <div className="flex flex-col items-end leading-none">
      <span
        className="font-mono tabular-nums font-bold"
        style={{ fontSize: "1.55vh", color: "#f0f4ff", letterSpacing: "0.04em" }}
      >
        {time} <span style={{ color: "#60a5fa" }}>IST</span>
      </span>
      <span style={{ fontSize: "1.1vh", color: "#64748b", marginTop: "0.4vh" }}>{date}</span>
    </div>
  );
}
