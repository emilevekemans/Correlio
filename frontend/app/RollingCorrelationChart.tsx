"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
  CartesianGrid,
} from "recharts";

type RollingPoint = {
  year: number;
  value: number; // [-1,1]
};

type ComputePayload = {
  rollingCorrelation?: RollingPoint[] | null;
  inputs?: {
    assets?: string[];
    rollingWindowMonths?: number;
  };
};

function fmtCorr(x: number) {
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(2);
}

export default function RollingCorrelationChart({ compute }: { compute: ComputePayload }) {
  const series = compute?.rollingCorrelation ?? null;
  if (!series || !Array.isArray(series) || series.length === 0) return null;

  const assets = compute?.inputs?.assets ?? [];
  const windowMonths = compute?.inputs?.rollingWindowMonths;

  // show only if exactly 2 assets
  if (!Array.isArray(assets) || assets.length !== 2) return null;

  const a1 = assets[0];
  const a2 = assets[1];

  const data = series
    .filter((p) => typeof p?.year === "number" && typeof p?.value === "number")
    .sort((x, y) => x.year - y.year);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const v = payload?.[0]?.value;
    return (
      <div style={{ background: "white", border: "1px solid #e2e8f0", padding: 12, borderRadius: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 6, color: "#0f172a" }}>Year {label}</div>
        <div style={{ color: "#0f172a" }}>
          Corr: <b>{fmtCorr(v)}</b>
        </div>
      </div>
    );
  };

  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 16, padding: 16 }}>
      <div style={{ color: "#475569", fontSize: 12, marginBottom: 8 }}>
        <b style={{ color: "#0f172a" }}>{a1}</b> vs <b style={{ color: "#0f172a" }}>{a2}</b>
        {typeof windowMonths === "number" ? <> • Window: <b style={{ color: "#0f172a" }}>{windowMonths}</b> months</> : null}
      </div>

      <div style={{ width: "100%", height: 320 }}>
        <ResponsiveContainer>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="year" tick={{ fill: "#0f172a", fontSize: 12 }} />
            <YAxis domain={[-1, 1]} tick={{ fill: "#0f172a", fontSize: 12 }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <ReferenceLine y={0} />
            <Line type="monotone" dataKey="value" name="Rolling corr" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={{ color: "#475569", fontSize: 12, marginTop: 8 }}>
        Corrélation ∈ [-1, +1]. Affiché uniquement si tu as <b>exactement 2</b> assets.
      </div>
    </div>
  );
}
