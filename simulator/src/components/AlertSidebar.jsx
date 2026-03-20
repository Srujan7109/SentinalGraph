// frontend-react/src/components/AlertSidebar.jsx
// SentinelGraph MVP – Alert Sidebar (w-1/3)
// Displays the `alerts` array as colour-coded warning cards with
// risk-score bars, severity filter tabs, and account-ID search.

import { useState } from "react";

// ── Severity styles ────────────────────────────────────────────────────────
const SEV = {
  CRITICAL: { bg: "bg-red-950/70",    border: "border-red-600",    badge: "bg-red-600 text-white",       dot: "bg-red-500"    },
  HIGH:     { bg: "bg-orange-950/60", border: "border-orange-600", badge: "bg-orange-500 text-white",    dot: "bg-orange-400" },
  MEDIUM:   { bg: "bg-yellow-950/50", border: "border-yellow-600", badge: "bg-yellow-500 text-gray-900", dot: "bg-yellow-400" },
  LOW:      { bg: "bg-gray-800/60",   border: "border-gray-700",   badge: "bg-gray-600 text-gray-200",   dot: "bg-gray-400"   },
};

function RiskBar({ score }) {
  const pct = Math.min(100, Math.round(score * 100));
  const col  = pct >= 80 ? "bg-red-500" : pct >= 50 ? "bg-orange-400" : pct >= 30 ? "bg-yellow-400" : "bg-gray-400";
  return (
    <div className="mt-2">
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>Risk</span>
        <span className="font-mono font-semibold">{pct}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-gray-700">
        <div className={`h-1.5 rounded-full transition-all duration-500 ${col}`}
             style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function AlertCard({ alert }) {
  const s = SEV[alert.status] ?? SEV.LOW;
  return (
    <div className={`rounded-lg border p-3 mb-2 hover:brightness-110 transition-all ${s.bg} ${s.border}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`}/>
          <span className="font-mono text-sm font-semibold truncate text-gray-100">
            {alert.account_id}
          </span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-bold flex-shrink-0 ${s.badge}`}>
          {alert.status}
        </span>
      </div>
      <RiskBar score={alert.risk_score} />
    </div>
  );
}

const FILTERS = ["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"];

export default function AlertSidebar({ alerts = [] }) {
  const [filter, setFilter] = useState("ALL");
  const [query,  setQuery]  = useState("");

  const visible = alerts
    .filter((a) => filter === "ALL" || a.status === filter)
    .filter((a) => !query.trim() || a.account_id.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-200 mb-3">
          🚨 Active Alerts
          <span className="ml-2 text-xs text-gray-500 font-normal">({alerts.length})</span>
        </h2>

        <input
          type="text"
          placeholder="Search account ID…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full px-3 py-1.5 mb-2 rounded bg-gray-800 border border-gray-700
                     text-sm text-gray-100 placeholder-gray-500 focus:outline-none
                     focus:border-blue-500"
        />

        <div className="flex gap-1 flex-wrap">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors
                ${filter === f ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-400 hover:bg-gray-600"}`}>
              {f} ({f === "ALL" ? alerts.length : alerts.filter((a) => a.status === f).length})
            </button>
          ))}
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-600 text-sm gap-2">
            <span className="text-3xl">✅</span>
            {alerts.length === 0 ? "No alerts" : "No matches"}
          </div>
        ) : (
          visible.map((a) => <AlertCard key={a.account_id} alert={a} />)
        )}
      </div>

      <div className="px-4 py-2 border-t border-gray-800 text-xs text-gray-600">
        Showing {visible.length} of {alerts.length}
      </div>
    </div>
  );
}