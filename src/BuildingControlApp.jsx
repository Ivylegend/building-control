import { useState, useEffect, useRef } from "react";
import mqtt from "mqtt";
import {
  Wifi,
  WifiOff,
  Lightbulb,
  Wind,
  Thermometer,
  Droplets,
  Activity,
  Settings,
  Clock,
  Zap,
  ZapOff,
  RotateCcw,
  Timer,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

// ── HiveMQ Cloud config ──────────────────────────────────────────
const MQTT_BROKER =
  "wss://b9ebd2b34c0e46d0b731e062f0a554c7.s1.eu.hivemq.cloud:8884/mqtt";
const MQTT_USER = "SBEMS";
const MQTT_PASS = "Chelsies@10";
const STATUS_TOPIC = "building/status";

const ZONE_NAMES = ["Room 1", "Room 2", "Room 3"];
const FAN_NAMES = ["Fan 1 (DHT 1)", "Fan 2 (DHT 2)"];

const initialStatus = {
  lights: [
    { zone: 1, light: "OFF", motion: false, override: "AUTO" },
    { zone: 2, light: "OFF", motion: false, override: "AUTO" },
  ],
  fans: [
    { fan: 1, state: "OFF", temp: null, humidity: null, override: "AUTO" },
    { fan: 2, state: "OFF", temp: null, humidity: null, override: "AUTO" },
  ],
  overrideTimeoutMin: 30,
  uptime: 0,
};

// ── Status Dot ────────────────────────────────────────────────────
function StatusDot({ active, pulse = false }) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      {pulse && active && (
        <span
          className="absolute inline-flex h-full w-full rounded-full opacity-75"
          style={{
            backgroundColor: "#22c55e",
            animation: "ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite",
          }}
        />
      )}
      <span
        className="relative inline-flex rounded-full h-2.5 w-2.5"
        style={{
          backgroundColor: active ? "#22c55e" : "#6b7280",
        }}
      />
    </span>
  );
}

// ── Badge ─────────────────────────────────────────────────────────
function Badge({ label, variant = "default" }) {
  const styles = {
    success:
      "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
    danger: "bg-red-500/20 text-red-300 border border-red-500/30",
    warning: "bg-amber-500/20 text-amber-300 border border-amber-500/30",
    info: "bg-sky-500/20 text-sky-300 border border-sky-500/30",
    default: "bg-slate-700/60 text-slate-400 border border-slate-600/40",
    override: "bg-violet-500/20 text-violet-300 border border-violet-500/30",
  };
  return (
    <span
      className={`inline-flex items-center text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${styles[variant]}`}
    >
      {label}
    </span>
  );
}

// ── Control Buttons ───────────────────────────────────────────────
function ControlButtons({ onSend, disabled }) {
  return (
    <div className="flex gap-2 mt-4">
      <button
        onClick={() => onSend("ON")}
        disabled={disabled}
        className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-xl transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
        style={{
          background: disabled
            ? undefined
            : "linear-gradient(135deg, #059669, #10b981)",
          color: "white",
          boxShadow: disabled ? undefined : "0 0 12px rgba(16,185,129,0.35)",
        }}
        onMouseEnter={(e) => {
          if (!disabled) e.currentTarget.style.filter = "brightness(1.1)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.filter = "";
        }}
      >
        <Zap size={12} />
        Force ON
      </button>
      <button
        onClick={() => onSend("OFF")}
        disabled={disabled}
        className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-xl transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
        style={{
          background: disabled
            ? undefined
            : "linear-gradient(135deg, #dc2626, #ef4444)",
          color: "white",
          boxShadow: disabled ? undefined : "0 0 12px rgba(239,68,68,0.35)",
        }}
        onMouseEnter={(e) => {
          if (!disabled) e.currentTarget.style.filter = "brightness(1.1)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.filter = "";
        }}
      >
        <ZapOff size={12} />
        Force OFF
      </button>
      <button
        onClick={() => onSend("AUTO")}
        disabled={disabled}
        className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-xl transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
        style={{
          background: disabled ? undefined : "rgba(71,85,105,0.7)",
          border: "1px solid rgba(100,116,139,0.4)",
          color: "#94a3b8",
        }}
        onMouseEnter={(e) => {
          if (!disabled) e.currentTarget.style.background = "rgba(71,85,105,0.9)";
        }}
        onMouseLeave={(e) => {
          if (!disabled) e.currentTarget.style.background = "rgba(71,85,105,0.7)";
        }}
      >
        <RotateCcw size={12} />
        Auto
      </button>
    </div>
  );
}

// ── Glass Card ────────────────────────────────────────────────────
function GlassCard({ children, className = "", glow = false }) {
  return (
    <div
      className={`rounded-2xl p-4 ${className}`}
      style={{
        background: "rgba(30, 41, 59, 0.7)",
        border: "1px solid rgba(71, 85, 105, 0.4)",
        backdropFilter: "blur(12px)",
        boxShadow: glow
          ? "0 0 0 1px rgba(99,102,241,0.15), 0 8px 32px rgba(0,0,0,0.4)"
          : "0 8px 32px rgba(0,0,0,0.3)",
      }}
    >
      {children}
    </div>
  );
}

// ── Section Header ────────────────────────────────────────────────
function SectionHeader({ icon: Icon, title, count }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div
        className="flex items-center justify-center w-8 h-8 rounded-xl"
        style={{
          background: "linear-gradient(135deg, rgba(99,102,241,0.3), rgba(139,92,246,0.3))",
          border: "1px solid rgba(99,102,241,0.4)",
        }}
      >
        <Icon size={16} className="text-indigo-300" />
      </div>
      <h2 className="text-base font-semibold text-slate-100">{title}</h2>
      {count !== undefined && (
        <span
          className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full"
          style={{
            background: "rgba(99,102,241,0.2)",
            color: "#a5b4fc",
            border: "1px solid rgba(99,102,241,0.3)",
          }}
        >
          {count}
        </span>
      )}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────
export default function BuildingControlApp() {
  const [status, setStatus] = useState(initialStatus);
  const [connected, setConnected] = useState(false);
  const [lastSeen, setLastSeen] = useState(null);
  const [timeoutInput, setTimeoutInput] = useState("30");
  const clientRef = useRef(null);

  useEffect(() => {
    const client = mqtt.connect(MQTT_BROKER, {
      username: MQTT_USER,
      password: MQTT_PASS,
      reconnectPeriod: 3000,
    });

    clientRef.current = client;

    client.on("connect", () => {
      setConnected(true);
      client.subscribe(STATUS_TOPIC);
    });

    client.on("disconnect", () => setConnected(false));
    client.on("error", () => setConnected(false));

    client.on("message", (topic, payload) => {
      if (topic === STATUS_TOPIC) {
        try {
          const data = JSON.parse(payload.toString());
          setStatus(data);
          setLastSeen(new Date());
          setTimeoutInput(String(data.overrideTimeoutMin));
        } catch (error) {
          console.log(error);
        }
      }
    });

    return () => client.end();
  }, []);

  const publish = (topic, msg) => {
    if (clientRef.current?.connected) {
      clientRef.current.publish(topic, msg);
    }
  };

  const sendLightCmd = (zoneIndex, cmd) =>
    publish(`building/zone${zoneIndex + 1}/light/set`, cmd);

  const sendFanCmd = (fanIndex, cmd) =>
    publish(`building/fan${fanIndex + 1}/set`, cmd);

  const sendTimeout = () => {
    const secs = parseInt(timeoutInput) * 60;
    if (!isNaN(secs) && secs > 0) {
      publish("building/override/timeout", String(secs));
    }
  };

  const formatUptime = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h}h ${m}m ${sec}s`;
  };

  const lightsOnCount = status.lights.filter((l) => l.light === "ON").length;
  const fansOnCount = status.fans.filter((f) => f.state === "ON").length;

  return (
    <>
      {/* Keyframe injection */}
      <style>{`
        @keyframes ping {
          75%, 100% { transform: scale(2); opacity: 0; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .card-enter { animation: fadeIn 0.4s ease both; }
        .bca-input:focus { outline: none; border-color: rgba(99,102,241,0.7) !important; box-shadow: 0 0 0 3px rgba(99,102,241,0.2); }
        .bca-input::-webkit-inner-spin-button, .bca-input::-webkit-outer-spin-button { -webkit-appearance: none; }
      `}</style>

      <div
        className="min-h-screen w-full"
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)",
        }}
      >
        {/* Background mesh */}
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(99,102,241,0.08) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(139,92,246,0.08) 0%, transparent 50%)",
          }}
        />

        <div className="relative max-w-2xl mx-auto px-4 py-6 pb-10">
          {/* ── Header ── */}
          <div className="flex items-start justify-between mb-7 card-enter">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{
                    background:
                      "linear-gradient(135deg, #6366f1, #8b5cf6)",
                    boxShadow: "0 0 20px rgba(99,102,241,0.5)",
                  }}
                >
                  <Activity size={18} color="white" />
                </div>
                <h1 className="text-2xl font-bold text-white tracking-tight">
                  Building Control
                </h1>
              </div>
              <p className="text-slate-400 text-sm ml-11">
                {lastSeen
                  ? `Last update: ${lastSeen.toLocaleTimeString()}`
                  : "Waiting for ESP32…"}
              </p>
            </div>

            <div className="flex flex-col items-end gap-2">
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-full"
                style={{
                  background: connected
                    ? "rgba(16,185,129,0.15)"
                    : "rgba(239,68,68,0.15)",
                  border: `1px solid ${connected ? "rgba(16,185,129,0.35)" : "rgba(239,68,68,0.35)"}`,
                }}
              >
                <StatusDot active={connected} pulse />
                {connected ? (
                  <Wifi size={13} className="text-emerald-400" />
                ) : (
                  <WifiOff size={13} className="text-red-400" />
                )}
                <span
                  className="text-xs font-semibold"
                  style={{ color: connected ? "#34d399" : "#f87171" }}
                >
                  {connected ? "Connected" : "Offline"}
                </span>
              </div>

              {status.uptime > 0 && (
                <div className="flex items-center gap-1 text-slate-500 text-xs">
                  <Clock size={11} />
                  <span>{formatUptime(status.uptime)}</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Stats Row ── */}
          <div className="grid grid-cols-3 gap-3 mb-6 card-enter" style={{ animationDelay: "0.05s" }}>
            {[
              {
                label: "Lights On",
                value: lightsOnCount,
                total: status.lights.length,
                icon: Lightbulb,
                color: "#fbbf24",
                glow: "rgba(251,191,36,0.3)",
              },
              {
                label: "Fans On",
                value: fansOnCount,
                total: status.fans.length,
                icon: Wind,
                color: "#38bdf8",
                glow: "rgba(56,189,248,0.3)",
              },
              {
                label: "Timeout",
                value: status.overrideTimeoutMin,
                unit: "min",
                icon: Timer,
                color: "#a78bfa",
                glow: "rgba(167,139,250,0.3)",
              },
            ].map(({ label, value, total, unit, icon: Icon, color }) => (
              <GlassCard key={label} className="text-center">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center mx-auto mb-2"
                  style={{
                    background: `${color}20`,
                    border: `1px solid ${color}40`,
                  }}
                >
                  <Icon size={16} style={{ color }} />
                </div>
                <div className="text-xl font-bold text-white">
                  {value}
                  {total !== undefined && (
                    <span className="text-sm font-normal text-slate-500">
                      /{total}
                    </span>
                  )}
                  {unit && (
                    <span className="text-xs font-normal text-slate-500 ml-0.5">
                      {unit}
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{label}</div>
              </GlassCard>
            ))}
          </div>

          {/* ── Admin Timeout ── */}
          <GlassCard
            className="mb-6 card-enter"
            glow
            style={{ animationDelay: "0.1s" }}
          >
            <SectionHeader icon={Settings} title="Override Timeout" />
            <div className="flex gap-3 items-center">
              <div className="relative flex-1 max-w-[120px]">
                <input
                  type="number"
                  min="1"
                  value={timeoutInput}
                  onChange={(e) => setTimeoutInput(e.target.value)}
                  className="bca-input w-full text-sm font-semibold text-slate-100 rounded-xl px-3 py-2 transition-all"
                  style={{
                    background: "rgba(15,23,42,0.7)",
                    border: "1px solid rgba(71,85,105,0.5)",
                    color: "#f1f5f9",
                  }}
                />
              </div>
              <span className="text-sm text-slate-500">minutes</span>
              <button
                onClick={sendTimeout}
                disabled={!connected}
                className="ml-auto flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  background: connected
                    ? "linear-gradient(135deg, #6366f1, #8b5cf6)"
                    : undefined,
                  color: "white",
                  boxShadow: connected
                    ? "0 0 16px rgba(99,102,241,0.4)"
                    : undefined,
                }}
                onMouseEnter={(e) => {
                  if (connected) e.currentTarget.style.filter = "brightness(1.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.filter = "";
                }}
              >
                <CheckCircle2 size={14} />
                Apply
              </button>
            </div>
            <p className="text-xs text-slate-600 mt-3 flex items-center gap-1">
              <AlertCircle size={11} />
              Current: {status.overrideTimeoutMin} min — overrides auto-return after this duration
            </p>
          </GlassCard>

          {/* ── Lights ── */}
          <div className="mb-6 card-enter" style={{ animationDelay: "0.15s" }}>
            <SectionHeader
              icon={Lightbulb}
              title="Lights"
              count={`${lightsOnCount}/${status.lights.length} on`}
            />
            <div className="grid grid-cols-1 gap-3">
              {status.lights.map((z, i) => (
                <GlassCard key={i} className={z.light === "ON" ? "" : ""}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300"
                        style={{
                          background:
                            z.light === "ON"
                              ? "rgba(251,191,36,0.2)"
                              : "rgba(71,85,105,0.3)",
                          border:
                            z.light === "ON"
                              ? "1px solid rgba(251,191,36,0.4)"
                              : "1px solid rgba(71,85,105,0.3)",
                          boxShadow:
                            z.light === "ON"
                              ? "0 0 12px rgba(251,191,36,0.25)"
                              : undefined,
                        }}
                      >
                        <Lightbulb
                          size={17}
                          style={{
                            color: z.light === "ON" ? "#fbbf24" : "#64748b",
                          }}
                        />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-100 text-sm">
                          {ZONE_NAMES[i]}
                        </p>
                        <p className="text-xs text-slate-500">
                          {z.motion ? "Motion detected" : "No motion"}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 justify-end">
                      <Badge
                        label={z.motion ? "Motion" : "Clear"}
                        variant={z.motion ? "warning" : "default"}
                      />
                      <Badge
                        label={z.light}
                        variant={z.light === "ON" ? "success" : "default"}
                      />
                      {z.override !== "AUTO" && (
                        <Badge
                          label={`Override: ${z.override}`}
                          variant="override"
                        />
                      )}
                    </div>
                  </div>
                  <ControlButtons
                    onSend={(cmd) => sendLightCmd(i, cmd)}
                    disabled={!connected}
                  />
                </GlassCard>
              ))}
            </div>
          </div>

          {/* ── Fans ── */}
          <div className="card-enter" style={{ animationDelay: "0.2s" }}>
            <SectionHeader
              icon={Wind}
              title="Fans"
              count={`${fansOnCount}/${status.fans.length} on`}
            />
            <div className="grid grid-cols-1 gap-3">
              {status.fans.map((f, i) => (
                <GlassCard key={i}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300"
                        style={{
                          background:
                            f.state === "ON"
                              ? "rgba(56,189,248,0.2)"
                              : "rgba(71,85,105,0.3)",
                          border:
                            f.state === "ON"
                              ? "1px solid rgba(56,189,248,0.4)"
                              : "1px solid rgba(71,85,105,0.3)",
                          boxShadow:
                            f.state === "ON"
                              ? "0 0 12px rgba(56,189,248,0.25)"
                              : undefined,
                          animation:
                            f.state === "ON" ? "spin 3s linear infinite" : undefined,
                        }}
                      >
                        <Wind
                          size={17}
                          style={{
                            color: f.state === "ON" ? "#38bdf8" : "#64748b",
                          }}
                        />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-100 text-sm">
                          {FAN_NAMES[i]}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="flex items-center gap-1 text-xs text-slate-500">
                            <Thermometer size={11} className="text-rose-400" />
                            {f.temp !== null && f.temp >= 0
                              ? `${f.temp.toFixed(1)}°C`
                              : "—"}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-slate-500">
                            <Droplets size={11} className="text-sky-400" />
                            {f.humidity !== null && f.humidity >= 0
                              ? `${f.humidity.toFixed(1)}%`
                              : "—"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 justify-end">
                      <Badge
                        label={f.state}
                        variant={f.state === "ON" ? "success" : "default"}
                      />
                      {f.override !== "AUTO" && (
                        <Badge
                          label={`Override: ${f.override}`}
                          variant="override"
                        />
                      )}
                    </div>
                  </div>
                  <ControlButtons
                    onSend={(cmd) => sendFanCmd(i, cmd)}
                    disabled={!connected}
                  />
                </GlassCard>
              ))}
            </div>
          </div>

          {/* Footer */}
          <p className="text-center text-slate-700 text-xs mt-8">
            SBEMS — Smart Building Energy Management System
          </p>
        </div>
      </div>
    </>
  );
}
