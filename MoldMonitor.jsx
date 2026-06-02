import { useState, useEffect, useRef } from "react";

const VARS = [
  { key: "cycleTime",    label: "Cycle Time",      unit: "sec", nominal: 28,   tolerance: 2,   low: 20,   high: 36   },
  { key: "meltTemp",     label: "Melt Temp",        unit: "°F",  nominal: 430,  tolerance: 10,  low: 400,  high: 460  },
  { key: "injPressure",  label: "Inject Pressure",  unit: "psi", nominal: 1200, tolerance: 80,  low: 1000, high: 1400 },
  { key: "holdPressure", label: "Hold Pressure",    unit: "psi", nominal: 800,  tolerance: 60,  low: 650,  high: 950  },
  { key: "coolTime",     label: "Cooling Time",     unit: "sec", nominal: 12,   tolerance: 1.5, low: 8,    high: 16   },
  { key: "shotWeight",   label: "Shot Weight",      unit: "g",   nominal: 45,   tolerance: 1.5, low: 40,   high: 50   },
];

const randNear = (nom, tol, drift = 0) =>
  +(nom + drift + (Math.random() - 0.5) * tol * 2.5).toFixed(2);

function genReading(drift = {}) {
  const r = {};
  VARS.forEach(v => { r[v.key] = randNear(v.nominal, v.tolerance, drift[v.key] || 0); });
  r.ts   = Date.now();
  r.shot = Math.floor(Math.random() * 9000) + 1000;
  return r;
}

function status(val, v) {
  const dev = Math.abs(val - v.nominal);
  if (dev > v.tolerance * 2) return "critical";
  if (dev > v.tolerance)     return "warn";
  return "ok";
}

const COLOR = { ok: "#00e5a0", warn: "#fbbf24", critical: "#f43f5e" };
const BG    = { ok: "#00e5a015", warn: "#fbbf2415", critical: "#f43f5e20" };

async function askClaude(readings, vars) {
  const varSummary = vars.map(v => {
    const val = readings[v.key];
    const s   = status(val, v);
    return `${v.label}: ${val}${v.unit} (nominal ${v.nominal}±${v.tolerance}) — ${s.toUpperCase()}`;
  }).join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: `You are an expert injection molding process technician AI assistant embedded in a live monitoring dashboard.
Analyze the current process readings and give SHORT, actionable corrective suggestions.
Be direct and technical — like talking to an experienced tech on the floor.
Format your response as JSON only: { "overall": "ok|warn|critical", "summary": "1 sentence", "actions": ["action1", "action2"] }
Max 3 actions. Each action max 12 words. No preamble.`,
      messages: [{ role: "user", content: `Current readings:\n${varSummary}\n\nAnalyze and respond with JSON only.` }],
    }),
  });

  const data = await res.json();
  const text = data.content?.map(c => c.text || "").join("") || "";
  try {
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return { overall: "ok", summary: "All parameters within range.", actions: [] };
  }
}

const Sparkline = ({ data, vkey, vdef }) => {
  const w = 120, h = 36;
  if (data.length < 2) return null;
  const vals  = data.map(d => d[vkey]);
  const min   = Math.min(...vals, vdef.low);
  const max   = Math.max(...vals, vdef.high);
  const scale = v => h - ((v - min) / (max - min || 1)) * h;
  const pts   = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${scale(v)}`).join(" ");
  const nomY  = scale(vdef.nominal);
  const lastVal = vals[vals.length - 1];
  const s = status(lastVal, vdef);
  return (
    <svg width={w} height={h} style={{ overflow: "visible" }}>
      <line x1={0} y1={nomY} x2={w} y2={nomY} stroke="#ffffff18" strokeWidth={1} strokeDasharray="3,3" />
      <polyline points={pts} fill="none" stroke={COLOR[s]} strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={(vals.length - 1) / (vals.length - 1) * w} cy={scale(lastVal)} r={3} fill={COLOR[s]} />
    </svg>
  );
};

export default function MoldMonitor() {
  const [running,   setRunning]   = useState(false);
  const [history,   setHistory]   = useState([]);
  const [current,   setCurrent]   = useState(genReading());
  const [ai,        setAi]        = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [drift,     setDrift]     = useState({});
  const [shotCount, setShotCount] = useState(0);
  const [scrap,     setScrap]     = useState(0);

  const timerRef   = useRef(null);
  const aiTimerRef = useRef(null);

  const tick = (d) => {
    const r = genReading(d);
    setCurrent(r);
    setShotCount(p => p + 1);
    const hasCrit = VARS.some(v => status(r[v.key], v) === "critical");
    if (hasCrit) setScrap(p => p + 1);
    setHistory(h => [...h.slice(-59), r]);
  };

  useEffect(() => {
    if (running) {
      timerRef.current = setInterval(() => tick(drift), 2000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [running, drift]);

  useEffect(() => {
    if (running) {
      const doAI = async () => {
        setAiLoading(true);
        const result = await askClaude(current, VARS);
        setAi(result);
        setAiLoading(false);
      };
      doAI();
      aiTimerRef.current = setInterval(doAI, 10000);
    } else {
      clearInterval(aiTimerRef.current);
    }
    return () => clearInterval(aiTimerRef.current);
  }, [running]);

  const injectFault = () => {
    setDrift({ meltTemp: 35, injPressure: 200, cycleTime: -5 });
    setTimeout(() => setDrift({}), 15000);
  };

  const overallStatus = VARS.reduce((worst, v) => {
    const s = status(current[v.key], v);
    if (s === "critical" || worst === "critical") return "critical";
    if (s === "warn"     || worst === "warn")     return "warn";
    return "ok";
  }, "ok");

  const efficiency = shotCount > 0
    ? (((shotCount - scrap) / shotCount) * 100).toFixed(1)
    : "100.0";

  return (
    <div style={{
      minHeight: "100vh",
      background: "#090e1a",
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      color: "#e2e8f0",
      padding: "0",
    }}>

      {/* HEADER */}
      <div style={{
        background: "linear-gradient(135deg, #0f1729 0%, #111827 100%)",
        borderBottom: "1px solid #1e2d4a",
        padding: "16px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: "linear-gradient(135deg, #1F5C8B, #00e5a0)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18,
          }}>⚙</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "0.05em", color: "#f1f5f9" }}>
              MOLDWATCH <span style={{ color: "#00e5a0" }}>AI</span>
            </div>
            <div style={{ fontSize: 10, color: "#64748b", letterSpacing: "0.1em" }}>
              INJECTION MOLDING PROCESS MONITOR
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: running ? COLOR[overallStatus] : "#334155",
            boxShadow: running ? `0 0 8px ${COLOR[overallStatus]}` : "none",
            animation: running ? "pulse 1.5s ease-in-out infinite" : "none",
          }} />
          <span style={{ fontSize: 11, color: running ? COLOR[overallStatus] : "#475569", letterSpacing: "0.1em" }}>
            {running ? overallStatus.toUpperCase() : "OFFLINE"}
          </span>
        </div>
      </div>

      <div style={{ padding: "20px 24px", maxWidth: 1100, margin: "0 auto" }}>

        {/* CONTROLS */}
        <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap", alignItems: "center" }}>
          <button
            onClick={() => { setRunning(r => !r); if (!running) { setShotCount(0); setScrap(0); setHistory([]); setAi(null); } }}
            style={{
              padding: "10px 24px", borderRadius: 6, border: "none", cursor: "pointer",
              background: running
                ? "linear-gradient(135deg, #f43f5e, #be123c)"
                : "linear-gradient(135deg, #00e5a0, #059669)",
              color: "#fff", fontFamily: "inherit", fontWeight: 700,
              fontSize: 12, letterSpacing: "0.1em",
              boxShadow: running ? "0 0 16px #f43f5e40" : "0 0 16px #00e5a040",
            }}>
            {running ? "⬛ STOP RUN" : "▶ START RUN"}
          </button>

          {running && (
            <button onClick={injectFault} style={{
              padding: "10px 20px", borderRadius: 6, border: "1px solid #f43f5e44",
              cursor: "pointer", background: "#1a0a10",
              color: "#f43f5e", fontFamily: "inherit", fontSize: 11,
              letterSpacing: "0.08em", fontWeight: 600,
            }}>
              ⚡ INJECT FAULT
            </button>
          )}

          <div style={{ marginLeft: "auto", display: "flex", gap: 20 }}>
            {[
              { label: "SHOTS",      value: shotCount },
              { label: "SCRAP",      value: scrap },
              { label: "EFFICIENCY", value: `${efficiency}%` },
            ].map(m => (
              <div key={m.label} style={{ textAlign: "right" }}>
                <div style={{ fontSize: 9, color: "#475569", letterSpacing: "0.12em" }}>{m.label}</div>
                <div style={{
                  fontSize: 20, fontWeight: 700,
                  color: m.label === "SCRAP" && scrap > 0 ? "#f43f5e" : "#f1f5f9",
                }}>
                  {m.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* VARIABLE GRID */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 12, marginBottom: 20,
        }}>
          {VARS.map(v => {
            const val    = current[v.key];
            const s      = status(val, v);
            const pct    = Math.min(100, Math.max(0, ((val - v.low) / (v.high - v.low)) * 100));
            const nomPct = ((v.nominal - v.low) / (v.high - v.low)) * 100;
            return (
              <div key={v.key} style={{
                background: "#0f172a",
                border: `1px solid ${s === "ok" ? "#1e2d4a" : COLOR[s] + "55"}`,
                borderRadius: 10, padding: "14px 16px",
                boxShadow: s !== "ok" ? `0 0 20px ${COLOR[s]}18` : "none",
                transition: "all 0.3s ease",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 9, color: "#475569", letterSpacing: "0.12em", marginBottom: 4 }}>
                      {v.label.toUpperCase()}
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: COLOR[s], lineHeight: 1 }}>
                      {val}
                      <span style={{ fontSize: 12, color: "#64748b", marginLeft: 4 }}>{v.unit}</span>
                    </div>
                    <div style={{ fontSize: 10, color: "#475569", marginTop: 4 }}>
                      NOM {v.nominal} ± {v.tolerance}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                    <div style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
                      color: COLOR[s], background: BG[s],
                      padding: "3px 8px", borderRadius: 4,
                    }}>{s.toUpperCase()}</div>
                    <Sparkline data={history} vkey={v.key} vdef={v} />
                  </div>
                </div>

                {/* gauge bar */}
                <div style={{ position: "relative", height: 4, background: "#1e293b", borderRadius: 2, marginTop: 12 }}>
                  <div style={{
                    position: "absolute", left: 0, top: 0, height: "100%",
                    width: `${pct}%`, background: COLOR[s],
                    borderRadius: 2, transition: "width 0.4s ease",
                  }} />
                  <div style={{
                    position: "absolute", top: -2, width: 2, height: 8,
                    background: "#ffffff60", borderRadius: 1,
                    left: `${nomPct}%`, transform: "translateX(-50%)",
                  }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* AI PANEL */}
        <div style={{
          background: "#0a1628",
          border: `1px solid ${ai ? (COLOR[ai.overall] + "44") : "#1e2d4a"}`,
          borderRadius: 12, padding: "18px 20px",
          boxShadow: ai && ai.overall !== "ok" ? `0 0 30px ${COLOR[ai.overall]}15` : "none",
          transition: "all 0.5s ease",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6,
              background: "linear-gradient(135deg, #1F5C8B44, #00e5a044)",
              border: "1px solid #00e5a033",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14,
            }}>🤖</div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#00e5a0" }}>
                AI PROCESS ADVISOR
              </div>
              <div style={{ fontSize: 9, color: "#334155", letterSpacing: "0.08em" }}>
                UPDATES EVERY 10 SECONDS
              </div>
            </div>
            {aiLoading && (
              <div style={{ marginLeft: "auto", fontSize: 10, color: "#475569", animation: "blink 1s ease-in-out infinite" }}>
                ◉ ANALYZING...
              </div>
            )}
          </div>

          {!running && (
            <div style={{ color: "#334155", fontSize: 12, letterSpacing: "0.05em" }}>
              Start a run to activate AI monitoring.
            </div>
          )}
          {running && !ai && !aiLoading && (
            <div style={{ color: "#475569", fontSize: 12 }}>Waiting for first analysis...</div>
          )}
          {ai && (
            <div>
              <div style={{
                fontSize: 13, color: "#cbd5e1", marginBottom: 12,
                padding: "10px 14px", background: "#0f172a", borderRadius: 8,
                borderLeft: `3px solid ${COLOR[ai.overall]}`,
              }}>
                {ai.summary}
              </div>
              {ai.actions?.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {ai.actions.map((a, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: 4,
                        background: COLOR[ai.overall] + "22",
                        border: `1px solid ${COLOR[ai.overall]}44`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 10, color: COLOR[ai.overall], fontWeight: 700, flexShrink: 0,
                      }}>{i + 1}</div>
                      <div style={{ fontSize: 12, color: "#94a3b8" }}>{a}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #090e1a; }
        ::-webkit-scrollbar-thumb { background: #1e2d4a; }
      `}</style>
    </div>
  );
}
