type Props = {
  compute: any;
};

function clamp(x: number, min: number, max: number) {
  return Math.max(min, Math.min(max, x));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpColor(
  c1: { r: number; g: number; b: number },
  c2: { r: number; g: number; b: number },
  t: number
) {
  const tt = clamp(t, 0, 1);
  return `rgb(
    ${Math.round(lerp(c1.r, c2.r, tt))},
    ${Math.round(lerp(c1.g, c2.g, tt))},
    ${Math.round(lerp(c1.b, c2.b, tt))}
  )`;
}

export default function PearsonHeatmap({ compute }: Props) {
  const matrix = compute?.pearsonMatrix;
  const overlap = compute?.overlapYears;

  if (!matrix) {
    return (
      <div className="text-sm text-slate-600">
        Pearson matrix available with at least 2 assets.
      </div>
    );
  }

  const assets = Object.keys(matrix);

  // 🎨 Diverging colormap: -1 → red | 0 → white | +1 → green
  const colorForValue = (v: number) => {
    const val = clamp(v, -1, 1);

    const RED = { r: 220, g: 38, b: 38 };
    const WHITE = { r: 255, g: 255, b: 255 };
    const GREEN = { r: 22, g: 163, b: 74 };

    if (val < 0) {
      const t = (val + 1); // [-1,0] → [0,1]
      return lerpColor(RED, WHITE, t);
    } else {
      const t = val; // [0,1]
      return lerpColor(WHITE, GREEN, t);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="mb-2 text-base font-semibold text-slate-900">
        Pearson Correlation Matrix (Heatmap)
      </div>

      <div className="mb-4 text-sm text-slate-600">
        Half-matrix view (redundant values removed). Diagonal kept.
      </div>

      <div className="overflow-auto">
        <table className="mx-auto border-collapse">
          <thead>
            <tr>
              <th className="p-4"></th>
              {assets.map((a) => (
                <th
                  key={a}
                  className="p-4 text-center text-sm font-bold text-slate-900"
                  style={{ minWidth: 140 }}
                >
                  {a}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {assets.map((row, rowIndex) => (
              <tr key={row}>
                <th className="p-4 text-left text-sm font-bold text-slate-900">
                  {row}
                </th>

                {assets.map((col, colIndex) => {
                  // ❌ Masque triangle supérieur
                  if (colIndex > rowIndex) {
                    return (
                      <td
                        key={col}
                        className="p-4"
                        style={{ minWidth: 140 }}
                      />
                    );
                  }

                  const val = matrix[row][col];
                  const n =
                    overlap?.[row]?.[col] ??
                    overlap?.[col]?.[row] ??
                    null;

                  return (
                    <td
                      key={col}
                      className="p-4 text-center font-semibold text-slate-900"
                      style={{
                        backgroundColor: colorForValue(val),
                        minWidth: 140,
                        fontSize: "1.05rem",
                      }}
                      title={
                        n
                          ? `${row} / ${col}\nCorrelation: ${val.toFixed(
                              2
                            )}\nOverlap years: ${n}`
                          : `${row} / ${col}\nCorrelation: ${val.toFixed(2)}`
                      }
                    >
                      <div className="text-lg">{val.toFixed(2)}</div>

                      {n !== null && (
                        <div className="mt-1 text-sm font-normal text-slate-700">
                          n = {n}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-xs text-slate-500 text-center">
        Color scale: red (-1) → white (0) → green (+1).
      </div>
    </div>
  );
}
