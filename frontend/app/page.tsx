"use client";

import { useEffect, useMemo, useState } from "react";
import YearlyReturnsChart from "./YearlyReturnsChart";
import RollingCorrelationChart from "./RollingCorrelationChart";
import PearsonHeatmap from "./PearsonHeatmap";

type AssetMeta = { asset: string; category: string; description?: string | null };

// Palette stable (pour les charts uniquement, pas pour la sélection)
const ASSET_PALETTE = [
  "#2563EB",
  "#DC2626",
  "#16A34A",
  "#7C3AED",
  "#F59E0B",
  "#0D9488",
  "#DB2777",
  "#4B5563",
  "#EA580C",
  "#0891B2",
  "#65A30D",
  "#9333EA",
];

function Card({
  title,
  subtitle,
  children,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-slate-900">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
        </div>
        {right}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost";
}) {
  const base =
    "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-50 disabled:cursor-not-allowed";
  const styles =
    variant === "primary"
      ? "bg-slate-900 text-white hover:bg-slate-800"
      : "bg-slate-100 text-slate-900 hover:bg-slate-200";
  return (
    <button className={`${base} ${styles}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

/**
 * ✅ FIX INPUT NUMÉRIQUE (sans casser le fonctionnement)
 * - Permet de vider le champ (pas de "0" forcé)
 * - L'utilisateur peut taper librement
 * - Le state numérique n'est mis à jour que quand la valeur est un entier valide
 * - Si champ vide: on garde la dernière valeur valide => compute inchangé
 */
function Input({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
}) {
  const [text, setText] = useState<string>(String(value));

  // Sync si value change depuis l'extérieur (ex: reload / preset)
  useEffect(() => {
    setText(String(value));
  }, [value]);

  const commitIfValid = (raw: string) => {
    const s = raw.trim();
    if (s === "") return; // vide => ne force pas 0, on garde le state actuel
    if (!/^-?\d+$/.test(s)) return; // pas un entier => on ignore côté state
    const n = parseInt(s, 10);
    if (!Number.isFinite(n)) return;
    onChange(n);
  };

  return (
    <label className="grid gap-1">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold text-slate-900">{label}</span>
        {hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
      </div>

      {/* IMPORTANT:
          - type="text" + inputMode="numeric" => UX similaire à number mais sans le 0 automatique
          - on garde une valeur texte contrôlée pour permettre l'effacement
      */}
      <input
        className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-400"
        type="text"
        inputMode="numeric"
        pattern="-?[0-9]*"
        value={text}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          commitIfValid(raw);
        }}
        onBlur={() => {
          // si vide, on remet la dernière valeur valide visible
          if (text.trim() === "") {
            setText(String(value));
            return;
          }
          // si non-vide, on commit si possible; sinon on revert visuellement
          const before = value;
          commitIfValid(text);
          // Si c'était invalide (ex: "20a"), revert
          if (!/^-?\d+$/.test(text.trim())) {
            setText(String(before));
          }
        }}
      />
    </label>
  );
}

function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-400"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder ?? "Search..."}
    />
  );
}

export default function Home() {
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

  const [assets, setAssets] = useState<AssetMeta[]>([]);
  const [assetsJson, setAssetsJson] = useState<any>(null);
  const [computeJson, setComputeJson] = useState<any>(null);

  const [selected, setSelected] = useState<string[]>([]);
  const [yearStart, setYearStart] = useState(1980);
  const [yearEnd, setYearEnd] = useState(2024);
  const [capPct, setCapPct] = useState(100);
  const [rollingWindowMonths, setRollingWindowMonths] = useState(24);

  const [loadingAssets, setLoadingAssets] = useState(false);
  const [loadingCompute, setLoadingCompute] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ✅ Recherche globale (optionnelle mais utile)
  const [assetSearch, setAssetSearch] = useState("");

  // ✅ Recherche par catégorie
  const [categorySearch, setCategorySearch] = useState<Record<string, string>>({});

  // ✅ Liste alpha STABLE basée sur /assets (pour couleurs chart)
  const allAssetsAlpha = useMemo(() => {
    return Array.from(new Set(assets.map((a) => a.asset))).sort();
  }, [assets]);

  // ✅ MAP COULEUR STABLE (pour les charts)
  const assetColors = useMemo(() => {
    const map: Record<string, string> = {};
    allAssetsAlpha.forEach((a, i) => {
      map[a] = ASSET_PALETTE[i % ASSET_PALETTE.length];
    });
    return map;
  }, [allAssetsAlpha]);

  const grouped = useMemo(() => {
    const globalQ = assetSearch.trim().toLowerCase();

    const map = new Map<string, AssetMeta[]>();
    for (const a of assets) {
      const key = a.category || "Uncategorized";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }

    const out = Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([cat, items]) => {
        const sorted = [...items].sort((x, y) => x.asset.localeCompare(y.asset));

        // 1) filtre global
        const globalFiltered =
          globalQ.length === 0
            ? sorted
            : sorted.filter((it) => {
                const code = (it.asset ?? "").toLowerCase();
                const desc = (it.description ?? "").toLowerCase();
                return code.includes(globalQ) || desc.includes(globalQ);
              });

        // 2) filtre spécifique catégorie
        const catQ = (categorySearch[cat] ?? "").trim().toLowerCase();
        const finalFiltered =
          catQ.length === 0
            ? globalFiltered
            : globalFiltered.filter((it) => {
                const code = (it.asset ?? "").toLowerCase();
                const desc = (it.description ?? "").toLowerCase();
                return code.includes(catQ) || desc.includes(catQ);
              });

        return [cat, finalFiltered] as const;
      })
      .filter(([, items]) => items.length > 0);

    return out;
  }, [assets, assetSearch, categorySearch]);

  const loadAssets = async () => {
    setError(null);
    setLoadingAssets(true);
    try {
      const res = await fetch(`${API_BASE}/assets`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail ?? `GET /assets failed (${res.status})`);

      setAssetsJson(data);
      setAssets(data.assets ?? []);

      if ((data.assets?.length ?? 0) >= 2 && selected.length === 0) {
        setSelected([data.assets[0].asset, data.assets[1].asset]);
      }
    } catch (e: any) {
      setError(e.message ?? "Failed to load assets");
    } finally {
      setLoadingAssets(false);
    }
  };

  const toggle = (code: string) => {
    setSelected((prev) => {
      if (prev.includes(code)) return prev.filter((x) => x !== code);
      if (prev.length >= 10) return prev;
      return [...prev, code];
    });
  };

  const removeSelected = (code: string) => {
    setSelected((prev) => prev.filter((x) => x !== code));
  };

  const compute = async () => {
    setError(null);
    setComputeJson(null);
    setLoadingCompute(true);

    try {
      const body = {
        assets: selected,
        yearRange: [yearStart, yearEnd],
        capPct,
        rollingWindowMonths,
      };

      const res = await fetch(`${API_BASE}/compute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail ?? `POST /compute failed (${res.status})`);

      setComputeJson(data);
    } catch (e: any) {
      setError(e.message ?? "Compute failed");
    } finally {
      setLoadingCompute(false);
    }
  };

  useEffect(() => {
    loadAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="mx-auto w-full max-w-[2100px] px-4 sm:px-6 py-8">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-600">
            CORRELIO • MVP DASHBOARD
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
            Correlation & Performance
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Backend: <span className="font-mono text-slate-800">{API_BASE}</span>
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="ghost" onClick={loadAssets} disabled={loadingAssets}>
            {loadingAssets ? "Loading..." : "Reload assets"}
          </Button>
          <Button onClick={compute} disabled={loadingCompute || selected.length === 0}>
            {loadingCompute ? "Computing..." : "Compute"}
          </Button>
        </div>
      </header>

      {error && (
        <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <div className="font-semibold">Error</div>
          <div className="mt-1">{error}</div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[460px_1fr]">
        <aside className="grid gap-6">
          <Card
            title="Assets"
            subtitle="Select up to 10 assets. Rolling correlation appears only with exactly 2 assets."
            right={
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800">
                {selected.length}/10
              </span>
            }
          >
            {/* ✅ Pills neutres */}
            <div className="mb-4 flex flex-wrap gap-2">
              {selected.length === 0 ? (
                <span className="text-sm text-slate-600">No asset selected</span>
              ) : (
                selected.map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-900"
                    title={s}
                  >
                    {s}
                    <button
                      type="button"
                      onClick={() => removeSelected(s)}
                      className="rounded-full px-1 text-slate-500 hover:text-slate-900"
                      aria-label={`Remove ${s}`}
                      title="Remove"
                    >
                      ×
                    </button>
                  </span>
                ))
              )}
            </div>

            {/* ✅ Search global */}
            <div className="mb-3">
              <SearchInput
                value={assetSearch}
                onChange={setAssetSearch}
                placeholder="Global search (code or description)..."
              />
              <div className="mt-2 text-xs text-slate-500">
                Optional global filter. Each category also has its own search when opened.
              </div>
            </div>

            {/* ✅ Categories dropdowns + per-category search */}
            <div className="max-h-[520px] overflow-auto rounded-xl border border-slate-200 bg-white p-3">
              {grouped.length === 0 ? (
                <div className="text-sm text-slate-600">No match.</div>
              ) : (
                grouped.map(([cat, items]) => {
                  const catQuery = categorySearch[cat] ?? "";

                  return (
                    <details
                      key={cat}
                      className="mb-3 rounded-xl border border-slate-200 bg-slate-50"
                      onToggle={(e) => {
                        // Rien d’obligatoire, mais tu peux auto-focus plus tard si tu veux.
                      }}
                    >
                      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-800">
                        {cat}{" "}
                        <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                          {items.length}
                        </span>
                      </summary>

                      <div className="p-3">
                        {/* ✅ Barre de recherche de catégorie */}
                        <div className="mb-3 flex items-center gap-2">
                          <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                            Filter
                          </div>
                          <div className="flex-1">
                            <SearchInput
                              value={catQuery}
                              onChange={(v) =>
                                setCategorySearch((prev) => ({ ...prev, [cat]: v }))
                              }
                              placeholder={`Search in ${cat}...`}
                            />
                          </div>
                          {catQuery.trim().length > 0 ? (
                            <button
                              type="button"
                              className="rounded-lg bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                              onClick={() =>
                                setCategorySearch((prev) => ({ ...prev, [cat]: "" }))
                              }
                              title="Clear"
                            >
                              Clear
                            </button>
                          ) : null}
                        </div>

                        <div className="grid gap-2">
                          {items.length === 0 ? (
                            <div className="text-sm text-slate-600">No match.</div>
                          ) : (
                            items.map((a) => {
                              const isOn = selected.includes(a.asset);
                              return (
                                <label
                                  key={a.asset}
                                  className="flex items-start gap-2 rounded-xl bg-white px-3 py-2 hover:bg-slate-50"
                                >
                                  {/* ✅ Checkbox neutre */}
                                  <input
                                    type="checkbox"
                                    checked={isOn}
                                    onChange={() => toggle(a.asset)}
                                    className="mt-0.5 h-4 w-4"
                                  />
                                  <div className="min-w-0">
                                    <div className="flex items-baseline gap-2">
                                      <span className="text-sm font-semibold text-slate-900">
                                        {a.asset}
                                      </span>
                                      {isOn ? (
                                        <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white">
                                          Selected
                                        </span>
                                      ) : null}
                                    </div>

                                    {a.description ? (
                                      <div className="mt-1 text-xs text-slate-600 line-clamp-2">
                                        {a.description}
                                      </div>
                                    ) : null}
                                  </div>
                                </label>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </details>
                  );
                })
              )}
            </div>
          </Card>

          <Card title="Compute settings" subtitle="Minimal controls. You can move these to Advanced later.">
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-3">
                <Input label="Year start" value={yearStart} onChange={setYearStart} />
                <Input label="Year end" value={yearEnd} onChange={setYearEnd} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Cap (visual)" value={capPct} onChange={setCapPct} hint="100 = ±100%" />
                <Input
                  label="Rolling window"
                  value={rollingWindowMonths}
                  onChange={setRollingWindowMonths}
                  hint="months"
                />
              </div>

              <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
                Backend returns are <b>decimal</b> (0.15 = 15%). UI formats to %.
              </div>
            </div>
          </Card>

          <Card title="Debug (JSON)" subtitle="Keep during MVP. Remove later.">
            <details className="group" open>
              <summary className="cursor-pointer text-sm font-semibold text-slate-900">/assets</summary>
              <pre className="mt-3 max-h-56 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900">
                {assetsJson ? JSON.stringify(assetsJson, null, 2) : "—"}
              </pre>
            </details>

            <details className="group mt-4" open>
              <summary className="cursor-pointer text-sm font-semibold text-slate-900">/compute</summary>
              <pre className="mt-3 max-h-56 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900">
                {computeJson ? JSON.stringify(computeJson, null, 2) : "—"}
              </pre>
            </details>
          </Card>
        </aside>

        <section className="grid gap-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-700">
              PERFORMANCE
            </div>
            <div className="text-lg font-semibold tracking-tight text-slate-900">Yearly Returns</div>
            <div className="mt-4">
              {computeJson ? (
                <YearlyReturnsChart compute={computeJson} assetColors={assetColors} />
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 p-8 text-sm text-slate-600">
                  Click <b>Compute</b> to generate results.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-700">
              RELATIONSHIP
            </div>
            <div className="text-lg font-semibold tracking-tight text-slate-900">Rolling Correlation</div>
            <div className="mt-4">
              {computeJson ? (
                <RollingCorrelationChart compute={computeJson} />
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 p-8 text-sm text-slate-600">
                  Select <b>exactly 2</b> assets and click <b>Compute</b>.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-700">
              MATRIX
            </div>
            <div className="text-lg font-semibold tracking-tight text-slate-900">
              Pearson Correlation Heatmap
            </div>
            <div className="mt-4">
              {computeJson ? (
                <PearsonHeatmap compute={computeJson} />
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 p-8 text-sm text-slate-600">
                  Compute with at least <b>2</b> assets.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      <footer className="mt-10 text-xs text-slate-600">
        MVP UI: clean & readable. Debug can be removed later.
      </footer>
    </main>
  );
}
