import { useState, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Area, AreaChart } from "recharts";

const FREQUENCIES = ["Weekly", "Bi-weekly", "Monthly"];

function formatCurrency(val) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(val);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function getOccurrences(item, startDate, endDate) {
  const dates = [];
  let current = new Date(item.startDate);
  while (current <= endDate) {
    if (current >= startDate) dates.push(new Date(current));
    if (item.frequency === "Weekly") current = addDays(current, 7);
    else if (item.frequency === "Bi-weekly") current = addDays(current, 14);
    else current = new Date(current.getFullYear(), current.getMonth() + 1, current.getDate());
    if (item.frequency === "Monthly" && current > endDate) break;
  }
  return dates;
}

const defaultItems = [
  { id: 1, name: "Paycheck", amount: 2500, type: "income", frequency: "Bi-weekly", startDate: new Date().toISOString().slice(0,10) },
  { id: 2, name: "Rent", amount: 1200, type: "expense", frequency: "Monthly", startDate: new Date().toISOString().slice(0,10) },
  { id: 3, name: "Groceries", amount: 300, type: "expense", frequency: "Weekly", startDate: new Date().toISOString().slice(0,10) },
];

const CustomTooltip = ({ active, payload, label, lowBalanceThreshold }) => {
  if (!active || !payload?.length) return null;
  const bal = payload[0]?.value;
  const isLow = bal < lowBalanceThreshold;
  return (
    <div style={{ background: "#1a1f2e", border: `1px solid ${isLow ? "#ff6b6b" : "#2dd4bf"}`, borderRadius: 10, padding: "10px 16px", fontFamily: "'DM Mono', monospace" }}>
      <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 4 }}>{label}</div>
      <div style={{ color: isLow ? "#ff6b6b" : "#2dd4bf", fontSize: 18, fontWeight: 700 }}>{formatCurrency(bal)}</div>
      {payload[0]?.payload?.delta !== 0 && (
        <div style={{ color: payload[0]?.payload?.delta > 0 ? "#86efac" : "#fca5a5", fontSize: 12, marginTop: 2 }}>
          {payload[0]?.payload?.delta > 0 ? "+" : ""}{formatCurrency(payload[0]?.payload?.delta)}
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [startingBalance, setStartingBalance] = useState(3000);
  const [lowBalanceThreshold, setLowBalanceThreshold] = useState(500);
  const [forecastDays, setForecastDays] = useState(60);
  const [items, setItems] = useState(defaultItems);
  const [nextId, setNextId] = useState(10);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", amount: "", type: "expense", frequency: "Monthly", startDate: new Date().toISOString().slice(0,10) });
  const [activeTab, setActiveTab] = useState("chart");

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0,0,0,0);
    return d;
  }, []);

  const endDate = useMemo(() => addDays(today, forecastDays), [today, forecastDays]);

  const chartData = useMemo(() => {
    // Build daily events map
    const events = {};
    for (let i = 0; i <= forecastDays; i++) {
      const d = addDays(today, i);
      const key = d.toISOString().slice(0,10);
      events[key] = 0;
    }
    items.forEach(item => {
      const occurrences = getOccurrences(item, today, endDate);
      occurrences.forEach(d => {
        const key = d.toISOString().slice(0,10);
        if (key in events) {
          const delta = item.type === "income" ? item.amount : -item.amount;
          events[key] += delta;
        }
      });
    });

    let balance = startingBalance;
    return Object.entries(events).map(([date, delta]) => {
      balance += delta;
      return { date, balance, delta };
    });
  }, [items, startingBalance, forecastDays, today, endDate]);

  const minBalance = useMemo(() => Math.min(...chartData.map(d => d.balance)), [chartData]);
  const endBalance = chartData[chartData.length - 1]?.balance ?? startingBalance;
  const lowBalanceDays = chartData.filter(d => d.balance < lowBalanceThreshold).length;
  const hasLowBalance = lowBalanceDays > 0;

  function addItem() {
    if (!form.name || !form.amount) return;
    setItems([...items, { ...form, id: nextId, amount: parseFloat(form.amount) }]);
    setNextId(nextId + 1);
    setForm({ name: "", amount: "", type: "expense", frequency: "Monthly", startDate: new Date().toISOString().slice(0,10) });
    setShowForm(false);
  }

  function removeItem(id) {
    setItems(items.filter(i => i.id !== id));
  }

  const labelStyle = { color: "#64748b", fontSize: 11, fontFamily: "'DM Mono', monospace", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6, display: "block" };
  const inputStyle = { background: "#0f1420", border: "1px solid #1e2a3a", borderRadius: 8, color: "#e2e8f0", padding: "10px 14px", fontFamily: "'DM Mono', monospace", fontSize: 14, width: "100%", boxSizing: "border-box", outline: "none" };
  const cardStyle = { background: "#111827", borderRadius: 14, padding: "20px 24px", border: "1px solid #1e2a3a" };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0f1a", color: "#e2e8f0", fontFamily: "'DM Sans', sans-serif", padding: "32px 20px" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #2dd4bf, #0ea5e9)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>💰</div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: "-0.5px" }}>Balance Forecast</h1>
          </div>
          <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>See where your checking account is headed</p>
        </div>

        {/* Top Controls */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
          <div style={cardStyle}>
            <label style={labelStyle}>Starting Balance</label>
            <input type="number" value={startingBalance} onChange={e => setStartingBalance(parseFloat(e.target.value) || 0)} style={inputStyle} />
          </div>
          <div style={cardStyle}>
            <label style={labelStyle}>⚠ Low Balance Alert</label>
            <input type="number" value={lowBalanceThreshold} onChange={e => setLowBalanceThreshold(parseFloat(e.target.value) || 0)} style={inputStyle} />
          </div>
          <div style={cardStyle}>
            <label style={labelStyle}>Forecast Days</label>
            <input type="number" min={7} max={365} value={forecastDays} onChange={e => setForecastDays(Math.max(7, Math.min(365, parseInt(e.target.value) || 30)))} style={inputStyle} />
          </div>
        </div>

        {/* Summary Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Today's Balance", value: formatCurrency(startingBalance), color: "#2dd4bf" },
            { label: `Balance in ${forecastDays}d`, value: formatCurrency(endBalance), color: endBalance >= startingBalance ? "#86efac" : "#fca5a5" },
            { label: "Projected Low", value: formatCurrency(minBalance), color: minBalance < lowBalanceThreshold ? "#ff6b6b" : "#86efac" },
            { label: "Low Balance Days", value: lowBalanceDays, color: hasLowBalance ? "#ff6b6b" : "#64748b" },
          ].map(card => (
            <div key={card.label} style={{ ...cardStyle, padding: "16px 20px" }}>
              <div style={{ ...labelStyle, marginBottom: 8 }}>{card.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: card.color, fontFamily: "'DM Mono', monospace" }}>{card.value}</div>
            </div>
          ))}
        </div>

        {/* Low balance warning banner */}
        {hasLowBalance && (
          <div style={{ background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.3)", borderRadius: 10, padding: "12px 18px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10, color: "#fca5a5", fontSize: 14 }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <span>Your balance is projected to drop below <strong>{formatCurrency(lowBalanceThreshold)}</strong> on <strong>{lowBalanceDays} day{lowBalanceDays !== 1 ? "s" : ""}</strong> within this forecast period.</span>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "#111827", borderRadius: 10, padding: 4, width: "fit-content", border: "1px solid #1e2a3a" }}>
          {["chart", "transactions"].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{ background: activeTab === tab ? "#1e2a3a" : "transparent", border: "none", color: activeTab === tab ? "#2dd4bf" : "#64748b", padding: "8px 20px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, textTransform: "capitalize" }}>
              {tab === "chart" ? "📈 Chart" : "🔄 Recurring Items"}
            </button>
          ))}
        </div>

        {activeTab === "chart" && (
          <div style={cardStyle}>
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3a" />
                <XAxis dataKey="date" tick={{ fill: "#475569", fontSize: 11, fontFamily: "DM Mono" }} tickFormatter={v => { const d = new Date(v); return `${d.getMonth()+1}/${d.getDate()}`; }} interval={Math.floor(forecastDays / 6)} />
                <YAxis tick={{ fill: "#475569", fontSize: 11, fontFamily: "DM Mono" }} tickFormatter={v => `$${(v/1000).toFixed(1)}k`} width={55} />
                <Tooltip content={<CustomTooltip lowBalanceThreshold={lowBalanceThreshold} />} />
                <ReferenceLine y={lowBalanceThreshold} stroke="#ff6b6b" strokeDasharray="4 4" label={{ value: "⚠ Low", position: "insideTopRight", fill: "#ff6b6b", fontSize: 11 }} />
                <Area type="monotone" dataKey="balance" stroke="#2dd4bf" strokeWidth={2.5} fill="url(#balGrad)" dot={false} activeDot={{ r: 5, fill: "#2dd4bf" }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {activeTab === "transactions" && (
          <div>
            {/* Items List */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
              {items.map(item => (
                <div key={item.id} style={{ ...cardStyle, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: item.type === "income" ? "#86efac" : "#fca5a5", flexShrink: 0 }} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{item.name}</div>
                      <div style={{ color: "#64748b", fontSize: 12, fontFamily: "'DM Mono', monospace", marginTop: 2 }}>{item.frequency} · starting {item.startDate}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 16, color: item.type === "income" ? "#86efac" : "#fca5a5" }}>
                      {item.type === "income" ? "+" : "-"}{formatCurrency(item.amount)}
                    </span>
                    <button onClick={() => removeItem(item.id)} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 16, padding: 4, lineHeight: 1 }}>✕</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add Form */}
            {showForm ? (
              <div style={{ ...cardStyle, border: "1px solid #2dd4bf33" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={labelStyle}>Name</label>
                    <input placeholder="e.g. Netflix" value={form.name} onChange={e => setForm({...form, name: e.target.value})} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Amount ($)</label>
                    <input type="number" placeholder="0" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Type</label>
                    <select value={form.type} onChange={e => setForm({...form, type: e.target.value})} style={inputStyle}>
                      <option value="income">Income</option>
                      <option value="expense">Expense</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Frequency</label>
                    <select value={form.frequency} onChange={e => setForm({...form, frequency: e.target.value})} style={inputStyle}>
                      {FREQUENCIES.map(f => <option key={f}>{f}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Start Date</label>
                    <input type="date" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} style={inputStyle} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={addItem} style={{ background: "linear-gradient(135deg, #2dd4bf, #0ea5e9)", border: "none", color: "#0a0f1a", padding: "10px 24px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>Add Item</button>
                  <button onClick={() => setShowForm(false)} style={{ background: "none", border: "1px solid #1e2a3a", color: "#64748b", padding: "10px 20px", borderRadius: 8, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowForm(true)} style={{ background: "none", border: "1px dashed #2dd4bf44", color: "#2dd4bf", padding: "12px 24px", borderRadius: 10, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, width: "100%" }}>
                + Add Recurring Item
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
