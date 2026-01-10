"use client";

/**
 * Backend contract: yearly returns are DECIMAL (0.15 = 15%).
 * UI displays percentages => multiply by 100.
 */

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from "recharts";

type YearlyRow = {
  asset: string;
  year: number;
  true_return: number; // decimal
  disp_return: number; // decimal
  clipped: boolean;
};

type ComputePayload = {
  yearlyReturns?: YearlyRow[];
};

const toPct = (x: number) => Number(x) * 100;
const fmtPct = (xPct: number) => `${xPct.toFixed(1)}%`;

export default function YearlyReturnsChart({
  compute,
  assetColors,
}: {
  compute: ComputePayload;
  assetColors: Record<string, string>;
}) {
  const rows = compute?.yearlyReturns;
  if (!rows || !Array.isArray(rows) || rows.length === 0) return null;

  const assets = Array.from(new Set(rows.map((r) => r.asset))).sort();
  const years = Array.from(new Set(rows.map((r) => r.year))).sort((a, b) => a - b);

  const byAssetYear: Record<string, Record<number, YearlyRow>> = {};
  for (const a of assets) byAssetYear[a] = {};
  for (const r of rows) {
    if (!r?.asset || typeof r.year !== "number") continue;
    byAssetYear[r.asset][r.year] = r;
  }

  const data = years.map((y) => {
    const row: any = { year: y };
    for (const a of assets) {
      const p = byAssetYear[a][y];
      row[a] = p ? toPct(p.disp_return) : null;
      row[`__meta__${a}`] = p ?? null;
    }
    return row;
  });

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;

    return (
      <div
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          padding: 12,
          borderRadius: 12,
          minWidth: 220,
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 6, color: "#0f172a" }}>Year {label}</div>

        {payload
          .filter((p: any) => p.dataKey && !String(p.dataKey).startsWith("__meta__"))
          .map((p: any) => {
            const asset = p.dataKey as string;
            const meta = p.payload?.[`__meta__${asset}`] as YearlyRow | null;
            if (!meta) return null;

            const c = assetColors[asset] ?? "#0f172a";

            return (
              <div key={asset} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 999, background: c }} />
                  <div style={{ fontWeight: 800, color: "#0f172a" }}>{asset}</div>
                </div>
                <div style={{ color: "#0f172a" }}>Displayed: {fmtPct(toPct(meta.disp_return))}</div>
                <div style={{ color: "#0f172a" }}>True: {fmtPct(toPct(meta.true_return))}</div>
                {meta.clipped && (
                  <div style={{ color: "#b45309", fontWeight: 700 }}>Clipped (cap applied)</div>
                )}
              </div>
            );
          })}
      </div>
    );
  };

  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 16, padding: 16 }}>
      <div style={{ width: "100%", height: 420 }}>
        <ResponsiveContainer>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="year" tick={{ fill: "#0f172a", fontSize: 12 }} />
            <YAxis tickFormatter={(v) => `${v}%`} tick={{ fill: "#0f172a", fontSize: 12 }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            {assets.map((a) => (
              <Bar key={a} dataKey={a} fill={assetColors[a] ?? "#0f172a"} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ color: "#475569", fontSize: 12, marginTop: 8 }}>
        Bar = <b>disp_return</b> (cap visuel). Tooltip = <b>true_return</b> + <b>clipped</b>.
      </div>
    </div>
  );
}
