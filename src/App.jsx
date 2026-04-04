import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Area, AreaChart } from "recharts";

const FREQUENCIES = ["One-time", "Weekly", "Bi-weekly", "Monthly", "Quarterly", "Annual"];
const FORECAST_OPTIONS = [
  { label: "30 days",  days: 30 },
  { label: "90 days",  days: 90 },
  { label: "180 days", days: 180 },
  { label: "1 year",   days: 365 },
  { label: "3 years",  days: 1095 },
  { label: "5 years",  days: 1825 },
];
const API = "/api";

function formatCurrency(val) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(val);
}
function addDays(date, days) {
  const d = new Date(date); d.setUTCDate(d.getUTCDate() + days); return d;
}
function addUTCMonths(date, months) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()));
}
function getOccurrences(item, startDate, endDate) {
  if (item.frequency === "One-time") {
    const d = new Date(item.startDate);
    return (d >= startDate && d <= endDate) ? [d] : [];
  }
  const dates = [];
  let current = new Date(item.startDate);
  const itemEnd = item.endDate ? new Date(item.endDate) : endDate;
  const effectiveEnd = itemEnd < endDate ? itemEnd : endDate;

  // Fast-forward to just before startDate to avoid iterating through
  // potentially thousands of past occurrences
  if (current < startDate) {
    if (item.frequency === "Weekly") {
      const weeks = Math.floor((startDate - current) / (7 * 86400000));
      current = addDays(current, Math.max(0, weeks - 1) * 7);
    } else if (item.frequency === "Bi-weekly") {
      const biweeks = Math.floor((startDate - current) / (14 * 86400000));
      current = addDays(current, Math.max(0, biweeks - 1) * 14);
    } else if (item.frequency === "Monthly") {
      const months = (startDate.getUTCFullYear() - current.getUTCFullYear()) * 12 + (startDate.getUTCMonth() - current.getUTCMonth());
      current = addUTCMonths(current, Math.max(0, months - 1));
    } else if (item.frequency === "Quarterly") {
      const months = (startDate.getUTCFullYear() - current.getUTCFullYear()) * 12 + (startDate.getUTCMonth() - current.getUTCMonth());
      current = addUTCMonths(current, Math.max(0, Math.floor(months / 3) - 1) * 3);
    } else if (item.frequency === "Annual") {
      const years = Math.max(0, startDate.getUTCFullYear() - current.getUTCFullYear() - 1);
      current = addUTCMonths(current, years * 12);
    }
  }

  while (current <= effectiveEnd) {
    if (current >= startDate) dates.push(new Date(current));
    if (item.frequency === "Weekly") current = addDays(current, 7);
    else if (item.frequency === "Bi-weekly") current = addDays(current, 14);
    else if (item.frequency === "Monthly") current = addUTCMonths(current, 1);
    else if (item.frequency === "Quarterly") current = addUTCMonths(current, 3);
    else if (item.frequency === "Annual") current = addUTCMonths(current, 12);
    else break;
  }
  return dates;
}
const todayStr = () => new Date().toISOString().slice(0, 10);

const darkTheme = {
  bg: "#0a0f1a", surface: "#111827", surface2: "#1e2a3a", border: "#1e2a3a",
  text: "#e2e8f0", textMuted: "#64748b", textSub: "#94a3b8",
  accent: "#2dd4bf", accentBlue: "#0ea5e9",
  income: "#86efac", expense: "#fca5a5", danger: "#ff6b6b",
  inputBg: "#0f1420", tooltipBg: "#1a1f2e", calDay: "#0f1420", calDayBorder: "#1e2a3a",
};
const lightTheme = {
  bg: "#f1f5f9", surface: "#ffffff", surface2: "#e2e8f0", border: "#cbd5e1",
  text: "#0f172a", textMuted: "#64748b", textSub: "#475569",
  accent: "#0d9488", accentBlue: "#0284c7",
  income: "#16a34a", expense: "#dc2626", danger: "#dc2626",
  inputBg: "#f8fafc", tooltipBg: "#ffffff", calDay: "#ffffff", calDayBorder: "#e2e8f0",
};

async function apiFetch(path, options = {}, token = null) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...options, headers: { ...headers, ...options.headers } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

const CustomTooltip = ({ active, payload, label, T, lowBalanceThreshold }) => {
  if (!active || !payload?.length) return null;
  const bal = payload[0]?.value;
  const isLow = bal < lowBalanceThreshold;
  const details = payload[0]?.payload?.details || [];
  return (
    <div style={{ background: T.tooltipBg, border: `1px solid ${isLow ? T.danger : T.accent}`, borderRadius: 10, padding: "12px 16px", fontFamily: "'DM Mono', monospace", boxShadow: "0 4px 20px rgba(0,0,0,0.2)", maxWidth: 280 }}>
      <div style={{ color: T.textSub, fontSize: 11, marginBottom: 6 }}>{label}</div>
      <div style={{ color: isLow ? T.danger : T.accent, fontSize: 20, fontWeight: 700, marginBottom: details.length ? 10 : 0 }}>{formatCurrency(bal)}</div>
      {details.length > 0 && (
        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          {details.map((d, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <span style={{ color: T.textSub, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
              <span style={{ color: d.type === "income" ? T.income : T.expense, fontSize: 12, fontWeight: 600, flexShrink: 0 }}>{d.type === "income" ? "+" : "-"}{formatCurrency(d.amount)}</span>
            </div>
          ))}
          {details.length > 1 && (
            <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${T.border}`, paddingTop: 4, marginTop: 2 }}>
              <span style={{ color: T.textMuted, fontSize: 11 }}>net</span>
              <span style={{ color: payload[0]?.payload?.delta >= 0 ? T.income : T.expense, fontSize: 12, fontWeight: 700 }}>{payload[0]?.payload?.delta >= 0 ? "+" : ""}{formatCurrency(payload[0]?.payload?.delta)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Auth Screen ───────────────────────────────────────────────────────────────
function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("checking");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const T = darkTheme;

  useEffect(() => {
    apiFetch("/needs-setup").then(d => setMode(d.needs_setup ? "setup" : "login")).catch(() => setMode("login"));
  }, []);

  async function handleSubmit() {
    setError(""); setLoading(true);
    try {
      const data = await apiFetch(mode === "setup" ? "/setup" : "/login", { method: "POST", body: JSON.stringify({ username, password }) });
      onAuth(data);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  const inputStyle = { background: T.inputBg, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, padding: "12px 16px", fontFamily: "'DM Mono', monospace", fontSize: 15, width: "100%", boxSizing: "border-box", outline: "none", marginBottom: 12 };

  if (mode === "checking") return <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", color: T.textMuted, fontFamily: "sans-serif" }}>Connecting...</div>;

  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: "40px 36px", width: "100%", maxWidth: 380 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${T.accent}, ${T.accentBlue})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>💰</div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: T.text }}>Balance Forecast</h1>
        </div>
        <p style={{ color: T.textMuted, fontSize: 14, marginBottom: 28, marginTop: 4 }}>{mode === "setup" ? "Create your admin account to get started" : "Sign in to your account"}</p>
        <input placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSubmit()} style={inputStyle} />
        <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSubmit()} style={inputStyle} />
        {error && <div style={{ color: T.danger, fontSize: 13, marginBottom: 12, fontFamily: "'DM Mono', monospace" }}>{error}</div>}
        <button onClick={handleSubmit} disabled={loading} style={{ background: `linear-gradient(135deg, ${T.accent}, ${T.accentBlue})`, border: "none", color: "#0a0f1a", padding: "12px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontFamily: "'DM Sans', sans-serif", fontSize: 15, width: "100%" }}>
          {loading ? "..." : mode === "setup" ? "Create Admin Account" : "Sign In"}
        </button>
      </div>
    </div>
  );
}

// ── Admin Panel ───────────────────────────────────────────────────────────────
function AdminPanel({ token, currentUser, T, onClose, onFactoryReset }) {
  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState({ username: "", password: "", is_admin: false });
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");

  useEffect(() => { apiFetch("/users", {}, token).then(setUsers); }, [token]);

  async function createUser() {
    setErr(""); setMsg("");
    try {
      const u = await apiFetch("/users", { method: "POST", body: JSON.stringify(newUser) }, token);
      setUsers(prev => [...prev, u]);
      setNewUser({ username: "", password: "", is_admin: false });
      setMsg(`User "${u.username}" created!`);
    } catch (e) { setErr(e.message); }
  }

  async function deleteUser(id, name) {
    if (!confirm(`Delete user "${name}"?`)) return;
    await apiFetch(`/users/${id}`, { method: "DELETE" }, token);
    setUsers(prev => prev.filter(u => u.id !== id));
  }

  async function changePassword() {
    setErr(""); setMsg("");
    if (pwForm.next !== pwForm.confirm) { setErr("New passwords don't match"); return; }
    try {
      await apiFetch("/change-password", { method: "POST", body: JSON.stringify({ current_password: pwForm.current, new_password: pwForm.next }) }, token);
      setMsg("Password changed!"); setPwForm({ current: "", next: "", confirm: "" });
    } catch (e) { setErr(e.message); }
  }

  async function factoryReset() {
    if (resetConfirm !== "RESET") return;
    setErr(""); setMsg("");
    try {
      await apiFetch("/factory-reset", { method: "POST" }, token);
      setMsg("Factory reset complete. All data cleared.");
      setResetConfirm("");
      onFactoryReset();
    } catch (e) { setErr(e.message); }
  }

  const inp = { background: T.inputBg, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, padding: "9px 12px", fontFamily: "'DM Mono', monospace", fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none" };
  const card = { background: T.surface, borderRadius: 14, padding: "20px 24px", border: `1px solid ${T.border}`, marginBottom: 20 };
  const lbl = { color: T.textMuted, fontSize: 11, fontFamily: "'DM Mono', monospace", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5, display: "block" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
      <div style={{ background: T.bg, borderRadius: 16, border: `1px solid ${T.border}`, padding: "28px 32px", width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: T.text }}>⚙️ Admin Panel</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 20 }}>✕</button>
        </div>
        {msg && <div style={{ background: T.accent + "22", border: `1px solid ${T.accent}44`, borderRadius: 8, padding: "10px 14px", marginBottom: 16, color: T.accent, fontSize: 13 }}>{msg}</div>}
        {err && <div style={{ background: T.danger + "22", border: `1px solid ${T.danger}44`, borderRadius: 8, padding: "10px 14px", marginBottom: 16, color: T.danger, fontSize: 13 }}>{err}</div>}
        <div style={card}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600, color: T.text }}>Change Password</h3>
          <div style={{ display: "grid", gap: 10 }}>
            <div><label style={lbl}>Current Password</label><input type="password" value={pwForm.current} onChange={e => setPwForm({...pwForm, current: e.target.value})} style={inp} /></div>
            <div><label style={lbl}>New Password</label><input type="password" value={pwForm.next} onChange={e => setPwForm({...pwForm, next: e.target.value})} style={inp} /></div>
            <div><label style={lbl}>Confirm New Password</label><input type="password" value={pwForm.confirm} onChange={e => setPwForm({...pwForm, confirm: e.target.value})} style={inp} /></div>
          </div>
          <button onClick={changePassword} style={{ marginTop: 12, background: `linear-gradient(135deg, ${T.accent}, ${T.accentBlue})`, border: "none", color: "#0a0f1a", padding: "9px 20px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>Update Password</button>
        </div>
        <div style={card}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600, color: T.text }}>Users</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {users.map(u => (
              <div key={u.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: T.surface2, borderRadius: 8, padding: "10px 14px" }}>
                <div><span style={{ fontWeight: 600, color: T.text, fontSize: 14 }}>{u.username}</span>{u.is_admin ? <span style={{ marginLeft: 8, fontSize: 11, color: T.accent, fontFamily: "'DM Mono', monospace" }}>ADMIN</span> : null}</div>
                {u.username !== currentUser && <button onClick={() => deleteUser(u.id, u.username)} style={{ background: "none", border: `1px solid ${T.danger}44`, color: T.danger, padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>Delete</button>}
              </div>
            ))}
          </div>
          <h4 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: T.textSub }}>Create New User</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div><label style={lbl}>Username</label><input value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} style={inp} /></div>
            <div><label style={lbl}>Password</label><input type="password" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} style={inp} /></div>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, color: T.textMuted, fontSize: 13, cursor: "pointer", marginBottom: 12 }}>
            <input type="checkbox" checked={newUser.is_admin} onChange={e => setNewUser({...newUser, is_admin: e.target.checked})} /> Grant admin access
          </label>
          <button onClick={createUser} style={{ background: T.surface2, border: `1px solid ${T.accent}44`, color: T.accent, padding: "9px 18px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>Create User</button>
        </div>
        <div style={{ ...card, border: `1px solid ${T.danger}44`, marginBottom: 0 }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600, color: T.danger }}>Factory Reset</h3>
          <p style={{ margin: "0 0 14px", fontSize: 13, color: T.textMuted, lineHeight: 1.5 }}>
            Permanently deletes all your items, reconciled marks, and overrides, and resets settings to defaults. This cannot be undone.
          </p>
          <label style={lbl}>Type RESET to confirm</label>
          <div style={{ display: "flex", gap: 10 }}>
            <input value={resetConfirm} onChange={e => setResetConfirm(e.target.value)} placeholder="RESET" style={{ ...inp, width: "auto", flex: 1 }} />
            <button onClick={factoryReset} disabled={resetConfirm !== "RESET"} style={{ background: resetConfirm === "RESET" ? T.danger : T.surface2, border: `1px solid ${T.danger}44`, color: resetConfirm === "RESET" ? "#fff" : T.textMuted, padding: "9px 18px", borderRadius: 8, cursor: resetConfirm === "RESET" ? "pointer" : "default", fontWeight: 700, fontFamily: "'DM Sans', sans-serif", fontSize: 13, whiteSpace: "nowrap" }}>Factory Reset</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Calendar View ─────────────────────────────────────────────────────────────
function CalendarView({ items, reconciled, cancelled, onToggleReconcile, onToggleCancelled, T }) {
  const today = useMemo(() => { const now = new Date(); return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())); }, []);
  const [calYear, setCalYear] = useState(today.getUTCFullYear());
  const [calMonth, setCalMonth] = useState(today.getUTCMonth());
  const monthStart = useMemo(() => new Date(Date.UTC(calYear, calMonth, 1)), [calYear, calMonth]);
  const monthEnd = useMemo(() => new Date(Date.UTC(calYear, calMonth + 1, 0)), [calYear, calMonth]);

  const eventsByDay = useMemo(() => {
    const map = {};
    items.forEach(item => {
      getOccurrences(item, monthStart, monthEnd).forEach(d => {
        const day = d.getUTCDate();
        if (!map[day]) map[day] = [];
        const key = `${item.id}_${d.toISOString().slice(0,10)}`;
        map[day].push({ item, key, isReconciled: !!reconciled[key], isCancelled: !!cancelled[key] });
      });
    });
    return map;
  }, [items, reconciled, cancelled, monthStart, monthEnd]);

  const firstDow = monthStart.getUTCDay();
  const daysInMonth = monthEnd.getUTCDate();
  const todayDateStr = today.toISOString().slice(0,10);
  const monthName = monthStart.toLocaleString("default", { month: "long", year: "numeric", timeZone: "UTC" });

  function prevMonth() { calMonth === 0 ? (setCalMonth(11), setCalYear(y => y-1)) : setCalMonth(m => m-1); }
  function nextMonth() { calMonth === 11 ? (setCalMonth(0), setCalYear(y => y+1)) : setCalMonth(m => m+1); }

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
        <button onClick={prevMonth} style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text, borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 16 }}>‹</button>
        <span style={{ fontWeight: 700, fontSize: 18, color: T.text, minWidth: 200, textAlign: "center" }}>{monthName}</span>
        <button onClick={nextMonth} style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text, borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 16 }}>›</button>
        <button onClick={() => { setCalMonth(today.getMonth()); setCalYear(today.getFullYear()); }} style={{ background: "none", border: "none", color: T.accent, cursor: "pointer", fontSize: 13, fontFamily: "'DM Mono', monospace", textDecoration: "underline" }}>today</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
          <div key={d} style={{ textAlign: "center", color: T.textMuted, fontSize: 11, fontFamily: "'DM Mono', monospace", padding: "4px 0", letterSpacing: "0.05em" }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {cells.map((day, idx) => {
          if (!day) return <div key={`e-${idx}`} />;
          const dateStr = `${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
          const isToday = dateStr === todayDateStr;
          const dayEvents = eventsByDay[day] || [];
          return (
            <div key={day} style={{ background: T.calDay, border: `1px solid ${isToday ? T.accent : T.calDayBorder}`, borderRadius: 10, padding: "6px 8px", minHeight: 80 }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: isToday ? 700 : 400, color: isToday ? T.accent : T.textMuted, marginBottom: 4 }}>{day}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {dayEvents.map(({ item, key, isReconciled, isCancelled }) => {
                  const color = isCancelled ? T.textMuted : isReconciled ? T.textMuted : (item.type === "income" ? T.income : T.expense);
                  const bg = isCancelled ? T.surface2 : isReconciled ? T.surface2 : (item.type === "income" ? T.income + "22" : T.expense + "22");
                  const border = isCancelled ? T.border : isReconciled ? T.border : (item.type === "income" ? T.income + "55" : T.expense + "55");
                  return (
                    <div key={key} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 4, padding: "2px 4px", fontSize: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, color, overflow: "hidden" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                        <span style={{ flex: 1, textDecoration: isCancelled ? "line-through" : isReconciled ? "line-through" : "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", opacity: isCancelled ? 0.5 : 1 }}>
                          {item.name} <span style={{ opacity: 0.8 }}>{item.type === "income" ? "+" : "-"}{formatCurrency(item.amount)}</span>
                        </span>
                        <button onClick={() => onToggleReconcile(key)} title={isReconciled ? "Un-reconcile" : "Reconcile"}
                          style={{ background: isReconciled ? T.accent + "33" : "none", border: `1px solid ${T.accent}55`, borderRadius: 3, color: T.accent, cursor: "pointer", fontSize: 9, lineHeight: 1, padding: "1px 3px", flexShrink: 0, fontWeight: 700 }}>✓</button>
                        <button onClick={() => onToggleCancelled(key)} title={isCancelled ? "Restore" : "Cancel occurrence"}
                          style={{ background: isCancelled ? T.danger + "33" : "none", border: `1px solid ${T.danger}55`, borderRadius: 3, color: T.danger, cursor: "pointer", fontSize: 9, lineHeight: 1, padding: "1px 3px", flexShrink: 0, fontWeight: 700 }}>✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
        <span style={{ fontSize: 12, color: T.textMuted, display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: T.income, display: "inline-block" }} /> Income</span>
        <span style={{ fontSize: 12, color: T.textMuted, display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: T.expense, display: "inline-block" }} /> Expense</span>
        <span style={{ fontSize: 12, color: T.textMuted, display: "flex", alignItems: "center", gap: 4 }}><span style={{ border: `1px solid ${T.accent}55`, borderRadius: 3, padding: "0 3px", color: T.accent, fontWeight: 700, fontSize: 10 }}>✓</span> Reconcile</span>
        <span style={{ fontSize: 12, color: T.textMuted, display: "flex", alignItems: "center", gap: 4 }}><span style={{ border: `1px solid ${T.danger}55`, borderRadius: 3, padding: "0 3px", color: T.danger, fontWeight: 700, fontSize: 10 }}>✕</span> Cancel occurrence</span>
      </div>
    </div>
  );
}

// ── Override Modal ───────────────────────────────────────────────────────────
function OverrideModal({ modal, onSave, onDelete, onClose, T }) {
  const [amount, setAmount] = useState(String(modal.currentAmount));
  const [applyToAll, setApplyToAll] = useState(false);
  const isOverridden = modal.currentAmount !== modal.defaultAmount;
  const isRecurring = !!modal.itemId; // itemId only passed for recurring items
  const inp = { background: T.inputBg, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, padding: "10px 14px", fontFamily: "'DM Mono', monospace", fontSize: 15, width: "100%", boxSizing: "border-box", outline: "none" };

  function handleSave() {
    onSave(modal.key, amount, applyToAll ? modal.itemId : null);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
      <div style={{ background: T.bg, borderRadius: 16, border: `1px solid ${T.border}`, padding: "28px 32px", width: "100%", maxWidth: 400 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.text }}>✏️ Override Amount</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 20 }}>✕</button>
        </div>
        <p style={{ color: T.textMuted, fontSize: 13, marginBottom: 20, marginTop: 4 }}>
          <strong style={{ color: T.text }}>{modal.itemName}</strong> on {modal.date}<br />
          Default amount: <span style={{ fontFamily: "'DM Mono', monospace", color: T.accent }}>${modal.defaultAmount}</span>
        </p>
        <label style={{ color: T.textMuted, fontSize: 11, fontFamily: "'DM Mono', monospace", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6, display: "block" }}>Amount ($)</label>
        <input
          type="number"
          value={amount}
          onChange={e => { setAmount(e.target.value); if (applyToAll) setApplyToAll(false); }}
          onKeyDown={e => e.key === "Enter" && handleSave()}
          style={{ ...inp, marginBottom: 12 }}
          autoFocus
        />
        {isRecurring && (
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 16, padding: "10px 14px", background: applyToAll ? (T.accent + "15") : T.surface2, borderRadius: 8, border: `1px solid ${applyToAll ? T.accent + "44" : T.border}`, transition: "all 0.15s" }}>
            <input type="checkbox" checked={applyToAll} onChange={e => setApplyToAll(e.target.checked)} style={{ width: 16, height: 16, accentColor: T.accent, cursor: "pointer" }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Apply to all future occurrences</div>
              <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>Updates the default amount for this item going forward</div>
            </div>
          </label>
        )}
        {!isRecurring && <div style={{ marginBottom: 16 }} />}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={handleSave} style={{ background: `linear-gradient(135deg, ${T.accent}, ${T.accentBlue})`, border: "none", color: "#0a0f1a", padding: "10px 24px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontFamily: "'DM Sans', sans-serif", fontSize: 14, flex: 1 }}>
            {applyToAll ? "Update All Future" : "Save Override"}
          </button>
          {isOverridden && !applyToAll && (
            <button onClick={() => onDelete(modal.key)} style={{ background: "none", border: `1px solid ${T.danger}44`, color: T.danger, padding: "10px 16px", borderRadius: 8, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>
              Remove
            </button>
          )}
          <button onClick={onClose} style={{ background: "none", border: `1px solid ${T.border}`, color: T.textMuted, padding: "10px 16px", borderRadius: 8, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [auth, setAuth] = useState(() => {
    try {
      const t = localStorage.getItem("bf_token"), u = localStorage.getItem("bf_username"), a = localStorage.getItem("bf_is_admin");
      return t ? { token: t, username: u, is_admin: a === "true" } : null;
    } catch { return null; }
  });
  const [darkMode, setDarkMode] = useState(true);
  const [startingBalance, setStartingBalance] = useState(3000);
  const [lowBalanceThreshold, setLowBalanceThreshold] = useState(500);
  const [forecastDays, setForecastDays] = useState(60);
  const [items, setItems] = useState([]);
  const [reconciled, setReconciled] = useState({});
  const [cancelled, setCancelled] = useState({});
  const [overrides, setOverrides] = useState({});
  const [loading, setLoading] = useState(true);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [overrideModal, setOverrideModal] = useState(null); // { key, itemName, currentAmount, date }
  const [showArchived, setShowArchived] = useState(false);
  const [editingBalance, setEditingBalance] = useState(false);
  const [balanceInput, setBalanceInput] = useState("");
  const [form, setForm] = useState({ name: "", amount: "", type: "expense", frequency: "Monthly", startDate: todayStr(), endDate: "" });
  const [activeTab, setActiveTab] = useState("chart");
  const [importError, setImportError] = useState("");
  const [importSuccess, setImportSuccess] = useState("");
  const settingsTimerRef = useRef(null);

  const T = darkMode ? darkTheme : lightTheme;

  function handleLogout() {
    ["bf_token","bf_username","bf_is_admin"].forEach(k => localStorage.removeItem(k));
    setAuth(null);
  }

  const loadData = useCallback(async () => {
    if (!auth) return;
    setLoading(true);
    try {
      const [settings, itemsData, reconciledData, cancelledData, overridesData] = await Promise.all([
        apiFetch("/settings", {}, auth.token),
        apiFetch("/items", {}, auth.token),
        apiFetch("/reconciled", {}, auth.token),
        apiFetch("/cancelled", {}, auth.token),
        apiFetch("/overrides", {}, auth.token),
      ]);
      setStartingBalance(settings.starting_balance);
      setLowBalanceThreshold(settings.low_balance_threshold);
      setForecastDays(settings.forecast_days);
      setDarkMode(!!settings.dark_mode);
      setItems(itemsData.map(i => { const ed = i.end_date || i.endDate || ""; const endDate = ed && !isNaN(new Date(ed)) && ed.includes('-') ? ed : ""; return { ...i, startDate: i.start_date || i.startDate, endDate }; }));
      setReconciled(reconciledData);
      setCancelled(cancelledData);
      setOverrides(overridesData);
    } catch (e) { if (e.message?.includes("token")) handleLogout(); }
    setLoading(false);
  }, [auth]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!auth || loading) return;
    if (settingsTimerRef.current) clearTimeout(settingsTimerRef.current);
    const t = setTimeout(() => {
      apiFetch("/settings", { method: "PUT", body: JSON.stringify({ starting_balance: startingBalance, low_balance_threshold: lowBalanceThreshold, forecast_days: forecastDays, dark_mode: darkMode }) }, auth.token);
    }, 800);
    settingsTimerRef.current = t;
    return () => clearTimeout(t);
  }, [startingBalance, lowBalanceThreshold, forecastDays, darkMode]);

  function handleAuth(data) {
    localStorage.setItem("bf_token", data.token);
    localStorage.setItem("bf_username", data.username);
    localStorage.setItem("bf_is_admin", String(data.is_admin));
    setAuth(data);
  }

  async function toggleReconcile(key) {
    const res = await apiFetch("/reconciled/toggle", { method: "POST", body: JSON.stringify({ key }) }, auth.token);
    setReconciled(prev => { const next = { ...prev }; if (res.reconciled) next[key] = true; else delete next[key]; return next; });
  }

  async function toggleCancelled(key) {
    const res = await apiFetch("/cancelled/toggle", { method: "POST", body: JSON.stringify({ key }) }, auth.token);
    setCancelled(prev => { const next = { ...prev }; if (res.cancelled) next[key] = true; else delete next[key]; return next; });
  }

  async function saveOverride(key, amount, applyToAllItemId) {
    const parsed = parseFloat(amount);
    if (applyToAllItemId) {
      // Update the item's base amount on the server
      await apiFetch(`/items/${applyToAllItemId}`, { method: "PUT", body: JSON.stringify({ amount: parsed }) }, auth.token);
      // Update local items state
      setItems(prev => prev.map(i => i.id === applyToAllItemId ? { ...i, amount: parsed } : i));
      // Remove any existing single-instance override for this occurrence
      await apiFetch(`/overrides/${encodeURIComponent(key)}`, { method: "DELETE" }, auth.token);
      setOverrides(prev => { const next = { ...prev }; delete next[key]; return next; });
    } else {
      await apiFetch("/overrides", { method: "POST", body: JSON.stringify({ key, amount: parsed }) }, auth.token);
      setOverrides(prev => ({ ...prev, [key]: parsed }));
    }
    setOverrideModal(null);
  }

  async function deleteOverride(key) {
    await apiFetch(`/overrides/${encodeURIComponent(key)}`, { method: "DELETE" }, auth.token);
    setOverrides(prev => { const next = { ...prev }; delete next[key]; return next; });
    setOverrideModal(null);
  }

  async function addItem() {
    if (!form.name || !form.amount) return;
    const item = await apiFetch("/items", { method: "POST", body: JSON.stringify({ ...form, amount: parseFloat(form.amount) }) }, auth.token);
    setItems(prev => [...prev, { ...item, startDate: item.start_date || item.startDate, endDate: (() => { const ed = item.end_date || item.endDate || ""; return ed && !isNaN(new Date(ed)) && ed.includes('-') ? ed : ""; })() }]);
    setForm({ name: "", amount: "", type: "expense", frequency: "Monthly", startDate: todayStr(), endDate: "" });
    setShowForm(false);
  }

  async function removeItem(id) {
    await apiFetch(`/items/${id}`, { method: "DELETE" }, auth.token);
    setItems(prev => prev.filter(i => i.id !== id));
    setReconciled(prev => { const next = { ...prev }; Object.keys(next).forEach(k => { if (k.startsWith(`${id}_`)) delete next[k]; }); return next; });
  }

  function exportCSV() {
    const header = "name,amount,type,frequency,startDate,endDate";
    const rows = items.map(i => `${i.name},${i.amount},${i.type},${i.frequency},${i.startDate},${i.endDate || ""}`);
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "balance-forecast-items.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  function handleCSVImport(e) {
    setImportError(""); setImportSuccess("");
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const lines = evt.target.result.trim().split("\n").filter(Boolean);
        const dataLines = lines[0].toLowerCase().includes("name") ? lines.slice(1) : lines;
        let imported = [], errors = [];
        for (const [idx, line] of dataLines.entries()) {
          const [name, amount, type, frequency, startDate, endDate] = line.split(",").map(s => s.trim());
          const rowNum = idx + 2;
          if (!name) { errors.push(`Row ${rowNum}: missing name`); continue; }
          if (isNaN(parseFloat(amount))) { errors.push(`Row ${rowNum}: invalid amount`); continue; }
          if (!["income","expense"].includes(type?.toLowerCase())) { errors.push(`Row ${rowNum}: type must be income or expense`); continue; }
          if (!FREQUENCIES.includes(frequency)) { errors.push(`Row ${rowNum}: invalid frequency`); continue; }
          if (!startDate || isNaN(new Date(startDate))) { errors.push(`Row ${rowNum}: invalid start date`); continue; }
          try {
            const item = await apiFetch("/items", { method: "POST", body: JSON.stringify({ name, amount: parseFloat(amount), type: type.toLowerCase(), frequency, startDate, endDate: endDate || "" }) }, auth.token);
            imported.push({ ...item, startDate: item.start_date || item.startDate, endDate: (() => { const ed = item.end_date || item.endDate || ""; return ed && !isNaN(new Date(ed)) && ed.includes('-') ? ed : ""; })() });
          } catch { errors.push(`Row ${rowNum}: server error`); }
        }
        if (errors.length) setImportError(`Skipped ${errors.length} row(s): ${errors.join(" | ")}`);
        if (imported.length) { setItems(prev => [...prev, ...imported]); setImportSuccess(`✓ Imported ${imported.length} item${imported.length !== 1 ? "s" : ""}!`); }
        else if (!errors.length) setImportError("No valid rows found.");
      } catch { setImportError("Could not parse file."); }
      e.target.value = "";
    };
    reader.readAsText(file);
  }

  const today = useMemo(() => { const now = new Date(); return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())); }, []);
  const endDate = useMemo(() => addDays(today, forecastDays), [today, forecastDays]);

  const reconciledAdjustment = useMemo(() => {
    let adj = 0;
    Object.keys(reconciled).forEach(key => {
      const [idStr] = key.split("_");
      const item = items.find(i => i.id === parseInt(idStr));
      if (!item) return;
      adj += item.type === "income" ? item.amount : -item.amount;
    });
    return adj;
  }, [reconciled, items]);

  const effectiveBalance = startingBalance + reconciledAdjustment;

  const chartData = useMemo(() => {
    const events = {};
    const eventDetails = {};
    for (let i = 0; i <= forecastDays; i++) {
      const key = addDays(today, i).toISOString().slice(0,10);
      events[key] = 0;
      eventDetails[key] = [];
    }
    const todayKey = today.toISOString().slice(0,10);
    const yesterday = addDays(today, -1);
    items.forEach(item => {
      // Past-due unreconciled occurrences: apply at today's position
      const lookbackStart = new Date(Math.max(new Date(item.startDate).getTime(), addDays(today, -365).getTime()));
      getOccurrences(item, lookbackStart, yesterday).forEach(d => {
        const dateStr = d.toISOString().slice(0,10);
        const recKey = `${item.id}_${dateStr}`;
        if (!reconciled[recKey] && !cancelled[recKey]) {
          const overrideAmt = overrides[recKey] !== undefined ? overrides[recKey] : item.amount;
          const delta = item.type === "income" ? overrideAmt : -overrideAmt;
          events[todayKey] += delta;
          eventDetails[todayKey].push({ name: item.name, amount: overrideAmt, type: item.type, delta, isOverridden: overrides[recKey] !== undefined, itemId: item.id, dateStr: todayKey });
        }
      });
      // Future occurrences from today onward
      getOccurrences(item, today, endDate).forEach(d => {
        const key = d.toISOString().slice(0,10);
        const recKey = `${item.id}_${key}`;
        if (key in events && !reconciled[recKey] && !cancelled[recKey]) {
          const overrideAmt = overrides[recKey] !== undefined ? overrides[recKey] : item.amount;
          const delta = item.type === "income" ? overrideAmt : -overrideAmt;
          events[key] += delta;
          const isOverridden = overrides[recKey] !== undefined;
          eventDetails[key].push({ name: item.name, amount: overrideAmt, type: item.type, delta, isOverridden, itemId: item.id, dateStr: key });
        }
      });
    });
    let balance = effectiveBalance;
    return Object.entries(events).map(([date, delta]) => {
      balance += delta;
      return { date, balance, delta, details: eventDetails[date] };
    });
  }, [items, effectiveBalance, forecastDays, today, endDate, reconciled, cancelled, overrides]);

  const minBalance = useMemo(() => chartData.length ? Math.min(...chartData.map(d => d.balance)) : 0, [chartData]);
  const endBalance = chartData[chartData.length - 1]?.balance ?? effectiveBalance;
  const lowBalanceDays = chartData.filter(d => d.balance < lowBalanceThreshold).length;
  const hasLowBalance = lowBalanceDays > 0;

  const reconcileWindow = useMemo(() => {
    const from = addDays(today, -7), to = addDays(today, 30);
    const rows = [];
    items.forEach(item => {
      getOccurrences(item, from, to).forEach(d => {
        const dateStr = d.toISOString().slice(0,10);
        const key = `${item.id}_${dateStr}`;
        rows.push({ item, dateStr, key, isReconciled: !!reconciled[key] });
      });
    });
    return rows.sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  }, [items, today, reconciled]);

  // Compute next occurrence date for sorting
  function getNextDate(item) {
    if (item.frequency === "One-time") return item.startDate;
    const far = addDays(today, 400);
    const occ = getOccurrences(item, today, far);
    if (occ.length > 0) return occ[0].toISOString().slice(0,10);
    // If no future occurrence, use start date
    return item.startDate;
  }

  const recurringItems = useMemo(() => {
    return items
      .filter(i => i.frequency !== "One-time")
      .sort((a, b) => getNextDate(a).localeCompare(getNextDate(b)));
  }, [items, today]);

  const oneTimeItems = useMemo(() => {
    return items
      .filter(i => i.frequency === "One-time" && i.startDate >= today.toISOString().slice(0,10))
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [items, today]);

  const archivedItems = useMemo(() => {
    return items
      .filter(i => i.frequency === "One-time" && i.startDate < today.toISOString().slice(0,10))
      .sort((a, b) => b.startDate.localeCompare(a.startDate)); // most recent first
  }, [items, today]);

  const cardStyle = { background: T.surface, borderRadius: 14, padding: "20px 24px", border: `1px solid ${T.border}` };
  const labelStyle = { color: T.textMuted, fontSize: 11, fontFamily: "'DM Mono', monospace", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6, display: "block" };
  const inputStyle = { background: T.inputBg, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, padding: "10px 14px", fontFamily: "'DM Mono', monospace", fontSize: 14, width: "100%", boxSizing: "border-box", outline: "none" };
  const btnPrimary = { background: `linear-gradient(135deg, ${T.accent}, ${T.accentBlue})`, border: "none", color: darkMode ? "#0a0f1a" : "#fff", padding: "10px 24px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontFamily: "'DM Sans', sans-serif", fontSize: 14 };
  const btnSecondary = { background: "none", border: `1px solid ${T.border}`, color: T.textMuted, padding: "10px 20px", borderRadius: 8, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 14 };
  const tabBtn = (active) => ({ background: active ? T.surface2 : "transparent", border: "none", color: active ? T.accent : T.textMuted, padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif", fontWeight: 600 });

  if (!auth) return <AuthScreen onAuth={handleAuth} />;
  if (loading) return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif", color: T.textMuted }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      Loading your data...
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", width: "100%", boxSizing: "border-box", background: T.bg, color: T.text, fontFamily: "'DM Sans', sans-serif", padding: "32px 20px", transition: "background 0.2s, color 0.2s" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      {showAdmin && <AdminPanel token={auth.token} currentUser={auth.username} T={T} onClose={() => setShowAdmin(false)} onFactoryReset={loadData} />}

      <div style={{ maxWidth: 1400, width: "100%", margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${T.accent}, ${T.accentBlue})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>💰</div>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: "-0.5px" }}>Balance Forecast</h1>
            </div>
            <p style={{ margin: 0, color: T.textMuted, fontSize: 14 }}>Signed in as <strong style={{ color: T.textSub }}>{auth.username}</strong></p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => setDarkMode(d => !d)} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 20, padding: "8px 16px", cursor: "pointer", color: T.text, fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600 }}>{darkMode ? "☀️ Light" : "🌙 Dark"}</button>
            {auth.is_admin && <button onClick={() => setShowAdmin(true)} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 20, padding: "8px 16px", cursor: "pointer", color: T.text, fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600 }}>⚙️ Admin</button>}
            <button onClick={handleLogout} style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: 20, padding: "8px 16px", cursor: "pointer", color: T.textMuted, fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>Sign Out</button>
          </div>
        </div>

        {/* Top Controls */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
          <div style={cardStyle}>
            <label style={labelStyle}>Today's Balance</label>
            {editingBalance ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="number"
                  value={balanceInput}
                  onChange={e => setBalanceInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") { setStartingBalance((parseFloat(balanceInput) || 0) - reconciledAdjustment); setEditingBalance(false); }
                    if (e.key === "Escape") setEditingBalance(false);
                  }}
                  style={{ ...inputStyle, marginBottom: 0 }}
                  autoFocus
                />
                <button onClick={() => { setStartingBalance((parseFloat(balanceInput) || 0) - reconciledAdjustment); setEditingBalance(false); }} style={{ background: `linear-gradient(135deg, ${T.accent}, ${T.accentBlue})`, border: "none", color: darkMode ? "#0a0f1a" : "#fff", borderRadius: 7, padding: "9px 14px", cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: "'DM Sans', sans-serif", flexShrink: 0 }}>✓</button>
                <button onClick={() => setEditingBalance(false)} style={{ background: "none", border: `1px solid ${T.border}`, color: T.textMuted, borderRadius: 7, padding: "9px 10px", cursor: "pointer", fontSize: 13, flexShrink: 0 }}>✕</button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 18, fontWeight: 700, color: T.accent }}>{formatCurrency(effectiveBalance)}</span>
                <button onClick={() => { setBalanceInput(String(startingBalance)); setEditingBalance(true); }} style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.textMuted, borderRadius: 7, padding: "5px 10px", cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>✏️ Edit</button>
              </div>
            )}
          </div>
          <div style={cardStyle}><label style={labelStyle}>⚠ Low Balance Alert</label><input type="number" value={lowBalanceThreshold} onChange={e => setLowBalanceThreshold(parseFloat(e.target.value) || 0)} style={inputStyle} /></div>
          <div style={cardStyle}>
            <label style={labelStyle}>Forecast Range</label>
            <select value={forecastDays} onChange={e => setForecastDays(parseInt(e.target.value))} style={inputStyle}>
              {FORECAST_OPTIONS.map(o => <option key={o.days} value={o.days}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {/* Summary Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Today's Balance", value: formatCurrency(effectiveBalance), color: T.accent },
            { label: `Balance in ${FORECAST_OPTIONS.find(o => o.days === forecastDays)?.label || forecastDays + "d"}`, value: formatCurrency(endBalance), color: endBalance >= effectiveBalance ? T.income : T.expense },
            { label: "Projected Low", value: formatCurrency(minBalance), color: minBalance < lowBalanceThreshold ? T.danger : T.income },
            { label: "Low Balance Days", value: lowBalanceDays, color: hasLowBalance ? T.danger : T.textMuted },
            { label: "Reconciled Items", value: Object.keys(reconciled).length, color: T.accent },
          ].map(card => (
            <div key={card.label} style={{ ...cardStyle, padding: "16px 20px" }}>
              <div style={{ ...labelStyle, marginBottom: 8 }}>{card.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: card.color, fontFamily: "'DM Mono', monospace" }}>{card.value}</div>
            </div>
          ))}
        </div>

        {hasLowBalance && (
          <div style={{ background: darkMode ? "rgba(255,107,107,0.1)" : "#fef2f2", border: `1px solid ${darkMode ? "rgba(255,107,107,0.3)" : "#fecaca"}`, borderRadius: 10, padding: "12px 18px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10, color: T.danger, fontSize: 14 }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <span>Balance projected below <strong>{formatCurrency(lowBalanceThreshold)}</strong> on <strong>{lowBalanceDays} day{lowBalanceDays !== 1 ? "s" : ""}</strong> in this period.</span>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, background: T.surface, borderRadius: 10, padding: 4, width: "fit-content", border: `1px solid ${T.border}`, flexWrap: "wrap" }}>
          {[["chart","📈 Chart"], ["transactions","🔄 Items"], ["reconcile","✅ Reconcile"], ["calendar","📅 Calendar"]].map(([tab, label]) => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={tabBtn(activeTab === tab)}>{label}</button>
          ))}
        </div>

        {activeTab === "chart" && (
          <div style={cardStyle}>
            <ResponsiveContainer width="100%" height={360}>
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <defs><linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={T.accent} stopOpacity={0.3} /><stop offset="95%" stopColor={T.accent} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                <XAxis dataKey="date" tick={{ fill: T.textMuted, fontSize: 11, fontFamily: "DM Mono" }} tickFormatter={v => { const d = new Date(v); return `${d.getMonth()+1}/${d.getDate()}`; }} interval={Math.floor(forecastDays / 6)} />
                <YAxis tick={{ fill: T.textMuted, fontSize: 11, fontFamily: "DM Mono" }} tickFormatter={v => `$${(v/1000).toFixed(1)}k`} width={60} />
                <Tooltip content={<CustomTooltip T={T} lowBalanceThreshold={lowBalanceThreshold} />} />
                <ReferenceLine y={lowBalanceThreshold} stroke={T.danger} strokeDasharray="4 4" label={{ value: "⚠ Low", position: "insideTopRight", fill: T.danger, fontSize: 11 }} />
                <Area type="monotone" dataKey="balance" stroke={T.accent} strokeWidth={2.5} fill="url(#balGrad)" dot={false} activeDot={{ r: 5, fill: T.accent }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {activeTab === "transactions" && (
          <div>
            {/* Override Modal */}
            {overrideModal && (
              <OverrideModal
                modal={overrideModal}
                onSave={saveOverride}
                onDelete={deleteOverride}
                onClose={() => setOverrideModal(null)}
                T={T}
              />
            )}

            {/* CSV bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <label style={{ background: T.surface2, border: `1px solid ${T.accent}44`, color: T.accent, padding: "9px 18px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}>
                ⬆ Import CSV <input type="file" accept=".csv" onChange={handleCSVImport} style={{ display: "none" }} />
              </label>
              <button onClick={exportCSV} style={{ background: T.surface2, border: `1px solid ${T.accent}44`, color: T.accent, padding: "9px 18px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>⬇ Export CSV</button>
            </div>
            {importSuccess && <div style={{ background: darkMode ? "rgba(134,239,172,0.1)" : "#f0fdf4", border: `1px solid ${darkMode ? "rgba(134,239,172,0.3)" : "#bbf7d0"}`, borderRadius: 8, padding: "10px 16px", marginBottom: 12, color: T.income, fontSize: 13 }}>{importSuccess}</div>}
            {importError && <div style={{ background: darkMode ? "rgba(255,107,107,0.1)" : "#fef2f2", border: `1px solid ${darkMode ? "rgba(255,107,107,0.3)" : "#fecaca"}`, borderRadius: 8, padding: "10px 16px", marginBottom: 12, color: T.danger, fontSize: 13 }}>{importError}</div>}

            {/* Recurring Items */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.textMuted, fontFamily: "'DM Mono', monospace", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>🔄 Recurring ({recurringItems.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {recurringItems.map(item => {
                  const nextDate = getNextDate(item);
                  // Find upcoming overrides for this item
                  const itemOverrides = Object.keys(overrides).filter(k => k.startsWith(`${item.id}_`));
                  return (
                    <div key={item.id} style={{ ...cardStyle, padding: "12px 20px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: item.type === "income" ? T.income : T.expense, flexShrink: 0 }} />
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 15 }}>{item.name}</div>
                            <div style={{ color: T.textMuted, fontSize: 12, fontFamily: "'DM Mono', monospace", marginTop: 2 }}>
                              {item.frequency} · next: {nextDate}{item.endDate ? ` · ends ${item.endDate}` : ""}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          {itemOverrides.length > 0 && (
                            <span style={{ fontSize: 11, color: T.accent, fontFamily: "'DM Mono', monospace", background: T.accent + "18", borderRadius: 4, padding: "2px 6px" }}>
                              {itemOverrides.length} override{itemOverrides.length > 1 ? "s" : ""}
                            </span>
                          )}
                          <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 15, color: item.type === "income" ? T.income : T.expense }}>
                            {item.type === "income" ? "+" : "-"}{formatCurrency(item.amount)}
                          </span>
                          <button
                            onClick={() => {
                              const recKey = `${item.id}_${nextDate}`;
                              setOverrideModal({ key: recKey, itemName: item.name, currentAmount: overrides[recKey] !== undefined ? overrides[recKey] : item.amount, defaultAmount: item.amount, date: nextDate, itemId: item.id });
                            }}
                            title="Override next occurrence amount"
                            style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.accent, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>
                            ✏️ Next
                          </button>
                          <button onClick={() => removeItem(item.id)} style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 16, padding: 4, lineHeight: 1 }}>✕</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* One-time Items */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.textMuted, fontFamily: "'DM Mono', monospace", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>📌 One-time ({oneTimeItems.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {oneTimeItems.map(item => (
                  <div key={item.id} style={{ ...cardStyle, padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: item.type === "income" ? T.income : T.expense, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{item.name}</div>
                        <div style={{ color: T.textMuted, fontSize: 12, fontFamily: "'DM Mono', monospace", marginTop: 2 }}>{item.startDate}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 15, color: item.type === "income" ? T.income : T.expense }}>
                        {item.type === "income" ? "+" : "-"}{formatCurrency(item.amount)}
                      </span>
                      <button onClick={() => removeItem(item.id)} style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 16, padding: 4, lineHeight: 1 }}>✕</button>
                    </div>
                  </div>
                ))}
                {oneTimeItems.length === 0 && (
                  <div style={{ color: T.textMuted, fontSize: 13, fontFamily: "'DM Mono', monospace", padding: "10px 0" }}>No upcoming one-time items.</div>
                )}
              </div>

              {/* Archived one-time items */}
              {archivedItems.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <button onClick={() => setShowArchived(a => !a)} style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: 12, padding: "6px 0", display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 10 }}>{showArchived ? "▼" : "▶"}</span>
                    📦 Archived ({archivedItems.length} completed)
                  </button>
                  {showArchived && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                      {archivedItems.map(item => (
                        <div key={item.id} style={{ ...cardStyle, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, opacity: 0.6 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ width: 6, height: 6, borderRadius: "50%", background: item.type === "income" ? T.income : T.expense, flexShrink: 0 }} />
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 14, textDecoration: "line-through" }}>{item.name}</div>
                              <div style={{ color: T.textMuted, fontSize: 11, fontFamily: "'DM Mono', monospace", marginTop: 1 }}>{item.startDate} · completed</div>
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, fontSize: 13, color: T.textMuted }}>
                              {item.type === "income" ? "+" : "-"}{formatCurrency(item.amount)}
                            </span>
                            <button onClick={() => removeItem(item.id)} style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 14, padding: 4, lineHeight: 1 }} title="Delete permanently">✕</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Add form */}
            {showForm ? (
              <div style={{ ...cardStyle, border: `1px solid ${T.accent}33` }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 14 }}>
                  <div><label style={labelStyle}>Name</label><input placeholder="e.g. Netflix" value={form.name} onChange={e => setForm({...form, name: e.target.value})} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Amount ($)</label><input type="number" placeholder="0" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Type</label><select value={form.type} onChange={e => setForm({...form, type: e.target.value})} style={inputStyle}><option value="income">Income</option><option value="expense">Expense</option></select></div>
                  <div><label style={labelStyle}>Frequency</label><select value={form.frequency} onChange={e => setForm({...form, frequency: e.target.value})} style={inputStyle}>{FREQUENCIES.map(f => <option key={f}>{f}</option>)}</select></div>
                  <div><label style={labelStyle}>{form.frequency === "One-time" ? "Date" : "Start Date"}</label><input type="date" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} style={inputStyle} /></div>
                  {form.frequency !== "One-time" && <div><label style={labelStyle}>End Date (optional)</label><input type="date" value={form.endDate} onChange={e => setForm({...form, endDate: e.target.value})} style={inputStyle} /></div>}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={addItem} style={btnPrimary}>Add Item</button>
                  <button onClick={() => setShowForm(false)} style={btnSecondary}>Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowForm(true)} style={{ background: "none", border: `1px dashed ${T.accent}44`, color: T.accent, padding: "12px 24px", borderRadius: 10, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, width: "100%" }}>+ Add Item</button>
            )}
          </div>
        )}

        {activeTab === "reconcile" && (
          <div>
            <p style={{ color: T.textMuted, fontSize: 14, marginTop: 0, marginBottom: 16 }}>Click an item to mark it as completed. Shows the past 7 days and next 30 days.</p>
            {reconcileWindow.length === 0 && <div style={{ ...cardStyle, color: T.textMuted, textAlign: "center", padding: 40 }}>No items in this window.</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {reconcileWindow.map(({ item, dateStr, key, isReconciled }) => {
                const isPast = dateStr < today.toISOString().slice(0,10);
                const effectiveAmount = overrides[key] !== undefined ? overrides[key] : item.amount;
                const isOverridden = overrides[key] !== undefined;
                return (
                  <div key={key} style={{ ...cardStyle, padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", opacity: isReconciled ? 0.6 : 1, borderColor: isReconciled ? T.accent : T.border, transition: "all 0.15s", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14, cursor: "pointer", flex: 1 }} onClick={() => toggleReconcile(key)}>
                      <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${isReconciled ? T.accent : T.textMuted}`, background: isReconciled ? T.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: darkMode ? "#0a0f1a" : "#fff", flexShrink: 0 }}>{isReconciled ? "✓" : ""}</div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14, textDecoration: isReconciled ? "line-through" : "none" }}>{item.name}</div>
                        <div style={{ color: T.textMuted, fontSize: 12, fontFamily: "'DM Mono', monospace" }}>{dateStr} · <span style={{ color: isPast ? T.expense : T.income }}>{isPast ? "past" : "upcoming"}</span></div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {isOverridden && <span style={{ fontSize: 10, color: T.accent, fontFamily: "'DM Mono', monospace", background: T.accent + "18", borderRadius: 4, padding: "2px 6px" }}>overridden</span>}
                      <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 15, color: item.type === "income" ? T.income : T.expense }}>
                        {item.type === "income" ? "+" : "-"}{formatCurrency(effectiveAmount)}
                        {isOverridden && <span style={{ fontSize: 11, color: T.textMuted, marginLeft: 4, textDecoration: "line-through" }}>{formatCurrency(item.amount)}</span>}
                      </span>
                      {!isReconciled && (
                        <button
                          onClick={e => { e.stopPropagation(); setOverrideModal({ key, itemName: item.name, currentAmount: effectiveAmount, defaultAmount: item.amount, date: dateStr, itemId: item.id }); }}
                          style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.accent, borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontSize: 11, fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>
                          ✏️
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {Object.keys(reconciled).length > 0 && (
              <div style={{ marginTop: 20, padding: "14px 20px", background: darkMode ? "rgba(45,212,191,0.08)" : "#f0fdfa", borderRadius: 10, border: `1px solid ${T.accent}33`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <span style={{ color: T.textSub, fontSize: 14 }}>
                  Adjustment: <strong style={{ color: reconciledAdjustment >= 0 ? T.income : T.expense }}>{reconciledAdjustment >= 0 ? "+" : ""}{formatCurrency(reconciledAdjustment)}</strong>
                  {" · "}New balance: <strong style={{ color: T.accent }}>{formatCurrency(effectiveBalance)}</strong>
                </span>
                <button onClick={async () => { await apiFetch("/reconciled", { method: "DELETE" }, auth.token); setReconciled({}); }} style={{ ...btnSecondary, fontSize: 12, padding: "6px 14px", color: T.danger, borderColor: T.danger }}>Clear all</button>
              </div>
            )}
          </div>
        )}

        {activeTab === "calendar" && (
          <div style={cardStyle}>
            <CalendarView items={items} reconciled={reconciled} cancelled={cancelled} onToggleReconcile={toggleReconcile} onToggleCancelled={toggleCancelled} T={T} />
          </div>
        )}
      </div>
    </div>
  );
}
