"use client";

import { useCallback, useState } from "react";

type DashboardData = {
  metrics: {
    customers: number;
    conversations: number;
    messages: number;
    webhookEvents: number;
    pendingFollowUps: number;
    pendingOutbox: number;
    failedWebhookEvents: number;
  };
  conversations: Array<{
    id: string;
    stage: string;
    status: string;
    active_product: string | null;
    last_customer_message_at: string | null;
    updated_at: string;
    customer: { name: string | null; whatsapp_number: string } | null;
  }>;
  messages: Array<{
    id: string;
    direction: string;
    body: string;
    created_at: string;
    conversation_id: string;
  }>;
  generatedAt: string;
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5eaf2",
  borderRadius: 16,
  padding: 20,
  minWidth: 0,
  boxShadow: "0 4px 18px rgba(25, 39, 70, 0.035)",
};

function dateLabel(value: string | null | undefined) {
  if (!value) return "No activity yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export default function AdminDashboardPage() {
  const [password, setPassword] = useState("");
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const loadDashboard = useCallback(async (key = password) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/overview", {
        headers: { Authorization: `Bearer ${key}` },
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) {
        setData(null);
        setError(result.error || (response.status === 401 ? "Incorrect dashboard password." : "Could not load dashboard."));
      } else {
        setData(result as DashboardData);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [password]);

  const logout = () => {
    setData(null);
    setPassword("");
    setError("");
  };

  const metricCards = data ? [
    ["Customers", data.metrics.customers, "Saved customer contacts"],
    ["Conversations", data.metrics.conversations, "Open and past sales chats"],
    ["Messages", data.metrics.messages, "Inbound and outbound records"],
    ["Webhook events", data.metrics.webhookEvents, "Events received by the app"],
    ["Pending follow-ups", data.metrics.pendingFollowUps, "Scheduled follow-up tasks"],
    ["Queued messages", data.metrics.pendingOutbox, "Outgoing messages awaiting dispatch"],
    ["Failed webhooks", data.metrics.failedWebhookEvents, "Events needing investigation"],
  ] as const : [];

  return (
    <main style={{ minHeight: "100vh", background: "#f5f7fb", color: "#172033", padding: "clamp(18px, 4vw, 40px)", fontFamily: "Arial, Helvetica, sans-serif" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 28 }}>
          <div>
            <p style={{ color: "#4f5fb5", fontSize: 12, fontWeight: 800, letterSpacing: ".12em", margin: "0 0 8px" }}>KINGDOM AI ACADEMY</p>
            <h1 style={{ fontSize: "clamp(28px, 4vw, 38px)", margin: 0, letterSpacing: "-.04em" }}>WhatsApp Sales OS</h1>
            <p style={{ margin: "8px 0 0", color: "#667085" }}>Admin overview · customer CRM · message operations</p>
            <a href="/admin/customers" style={{ display: "inline-block", marginTop: 12, color: "#3545a5", fontWeight: 700, textDecoration: "none" }}>Open customer CRM →</a>
          </div>
          {data && <button onClick={logout} style={{ border: "1px solid #d9dfeb", borderRadius: 10, background: "#fff", padding: "10px 14px", cursor: "pointer", fontWeight: 700 }}>Lock dashboard</button>}
        </header>

        {!data && (
          <section style={{ ...cardStyle, maxWidth: 520, margin: "48px auto", padding: 28 }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 22 }}>Admin sign-in</h2>
            <p style={{ color: "#667085", lineHeight: 1.6, marginTop: 0 }}>Enter the dashboard password configured in Vercel. Your password is sent only to this site over HTTPS and is not saved in browser storage.</p>
            <form onSubmit={(event) => { event.preventDefault(); void loadDashboard(password); }}>
              <label htmlFor="admin-password" style={{ display: "block", fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Dashboard password</label>
              <input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required style={{ width: "100%", boxSizing: "border-box", padding: 13, border: "1px solid #ccd4e2", borderRadius: 10, fontSize: 16, marginBottom: 12 }} />
              <button type="submit" disabled={loading} style={{ width: "100%", background: "#3545a5", color: "#fff", border: 0, borderRadius: 10, padding: 13, fontWeight: 800, cursor: loading ? "wait" : "pointer" }}>{loading ? "Checking…" : "Open dashboard"}</button>
            </form>
            {error && <p role="alert" style={{ color: "#b42318", background: "#fff1f0", borderRadius: 8, padding: 12, marginBottom: 0, lineHeight: 1.5 }}>{error}</p>}
          </section>
        )}

        {data && (
          <>
            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 22 }}>
              {metricCards.map(([label, value, description]) => (
                <div key={label} style={cardStyle}>
                  <p style={{ margin: 0, color: "#667085", fontSize: 13, fontWeight: 700 }}>{label}</p>
                  <p style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-.04em", margin: "10px 0 5px" }}>{value}</p>
                  <p style={{ color: "#7b8496", fontSize: 12, margin: 0, lineHeight: 1.4 }}>{description}</p>
                </div>
              ))}
            </section>

            {data.metrics.failedWebhookEvents > 0 && (
              <div role="alert" style={{ background: "#fff4e5", border: "1px solid #ffd7a3", borderRadius: 12, padding: 15, marginBottom: 20, color: "#7a3e00" }}>
                <strong>Webhook attention needed:</strong> {data.metrics.failedWebhookEvents} event(s) failed. Check Vercel runtime logs and the webhook_events table before launch.
              </div>
            )}

            <section style={{ ...cardStyle, marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 20 }}>Recent conversations</h2>
                  <p style={{ color: "#667085", margin: "6px 0 0", fontSize: 13 }}>Latest updated customer threads</p>
                </div>
                <button onClick={() => void loadDashboard()} disabled={loading} style={{ border: "1px solid #d9dfeb", borderRadius: 9, background: "#fff", padding: "9px 12px", cursor: "pointer", fontWeight: 700 }}>{loading ? "Refreshing…" : "Refresh data"}</button>
              </div>
              {data.conversations.length === 0 ? (
                <p style={{ background: "#f7f8fc", borderRadius: 10, padding: 18, color: "#667085", lineHeight: 1.6, margin: 0 }}>No conversations have been recorded yet. Once the WhatsApp webhook receives and processes a customer message, the customer thread should appear here.</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 650 }}>
                    <thead><tr>{["Customer", "WhatsApp", "Stage", "Status", "Last activity"].map((h) => <th key={h} style={{ textAlign: "left", color: "#667085", fontSize: 12, padding: "11px 10px", borderBottom: "1px solid #e9edf4" }}>{h}</th>)}</tr></thead>
                    <tbody>{data.conversations.map((item) => <tr key={item.id}>
                      <td style={{ padding: 12, borderBottom: "1px solid #edf0f5", fontWeight: 700 }}>{item.customer?.name || "New customer"}</td>
                      <td style={{ padding: 12, borderBottom: "1px solid #edf0f5" }}>{item.customer?.whatsapp_number || "—"}</td>
                      <td style={{ padding: 12, borderBottom: "1px solid #edf0f5" }}><span style={{ background: "#eef0ff", color: "#3545a5", padding: "4px 8px", borderRadius: 20, fontSize: 12 }}>{item.stage}</span></td>
                      <td style={{ padding: 12, borderBottom: "1px solid #edf0f5" }}>{item.status}</td>
                      <td style={{ padding: 12, borderBottom: "1px solid #edf0f5", color: "#667085" }}>{dateLabel(item.last_customer_message_at || item.updated_at)}</td>
                    </tr>)}</tbody>
                  </table>
                </div>
              )}
            </section>

            <section style={cardStyle}>
              <h2 style={{ margin: "0 0 5px", fontSize: 20 }}>Recent message activity</h2>
              <p style={{ color: "#667085", margin: "0 0 14px", fontSize: 13 }}>Latest stored inbound and outbound messages</p>
              {data.messages.length === 0 ? (
                <p style={{ background: "#f7f8fc", borderRadius: 10, padding: 18, color: "#667085", lineHeight: 1.6, margin: 0 }}>No messages are stored yet. This is expected until a webhook event is successfully processed.</p>
              ) : data.messages.map((message) => (
                <article key={message.id} style={{ padding: "13px 0", borderBottom: "1px solid #edf0f5" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
                    <strong style={{ color: message.direction === "inbound" ? "#25664b" : "#3545a5", fontSize: 12, textTransform: "uppercase" }}>{message.direction}</strong>
                    <time style={{ color: "#7b8496", fontSize: 12 }}>{dateLabel(message.created_at)}</time>
                  </div>
                  <p style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.5 }}>{message.body}</p>
                </article>
              ))}
            </section>
            <p style={{ color: "#7b8496", fontSize: 12, textAlign: "right", marginTop: 16 }}>Last loaded: {dateLabel(data.generatedAt)} · Data is live when refreshed.</p>
          </>
        )}
      </div>
    </main>
  );
}
