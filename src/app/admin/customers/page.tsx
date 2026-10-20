"use client";

import { useCallback, useState } from "react";

type Message = { id: string; direction: string; body: string; created_at: string };
type Conversation = { id: string; stage: string; status: string; active_product: string | null; last_customer_message_at: string | null; updated_at: string; messages: Message[] };
type Customer = { id: string; name: string | null; whatsapp_number: string; language: string; marketing_opt_out: boolean; created_at: string; updated_at: string; conversations: Conversation[] };

function date(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
}

export default function CustomersPage() {
  const [password, setPassword] = useState("");
  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  const load = useCallback(async (key = password, q = search) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      const response = await fetch(`/api/admin/customers?${params.toString()}`, {
        headers: { Authorization: `Bearer ${key}` }, cache: "no-store"
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Could not load CRM.");
        setAuthenticated(false);
        return;
      }
      setCustomers(result.customers ?? []);
      setAuthenticated(true);
      setSelected((current) => current && (result.customers ?? []).some((c: Customer) => c.id === current) ? current : null);
    } catch {
      setError("Network error. Please retry.");
    } finally {
      setLoading(false);
    }
  }, [password, search]);

  const activeCustomer = customers.find((customer) => customer.id === selected) ?? null;

  return <main style={{ minHeight: "100vh", background: "#f5f7fb", color: "#172033", padding: "clamp(18px, 4vw, 40px)", fontFamily: "Arial, Helvetica, sans-serif" }}>
    <div style={{ maxWidth: 1240, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
        <div><p style={{ margin: "0 0 7px", color: "#4f5fb5", fontWeight: 800, letterSpacing: ".1em", fontSize: 12 }}>KINGDOM AI ACADEMY · CRM</p><h1 style={{ margin: 0, fontSize: "clamp(28px, 4vw, 38px)", letterSpacing: "-.04em" }}>Customers</h1><p style={{ color: "#667085", margin: "7px 0 0" }}>Customer profiles, sales stage, consent status and conversation history.</p></div>
        <a href="/admin" style={{ color: "#3545a5", textDecoration: "none", fontWeight: 700 }}>← Admin overview</a>
      </header>

      {!authenticated ? <section style={{ background: "#fff", border: "1px solid #e5eaf2", borderRadius: 16, padding: 26, maxWidth: 520, margin: "50px auto" }}>
        <h2 style={{ marginTop: 0 }}>Admin sign-in</h2><p style={{ color: "#667085", lineHeight: 1.6 }}>Use the same ADMIN_DASHBOARD_PASSWORD configured in Vercel. The password is not stored in browser storage.</p>
        <form onSubmit={(event) => { event.preventDefault(); void load(password, ""); }}>
          <label htmlFor="crm-password" style={{ display: "block", fontWeight: 700, marginBottom: 7 }}>Dashboard password</label>
          <input id="crm-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required style={{ width: "100%", boxSizing: "border-box", padding: 12, border: "1px solid #ccd4e2", borderRadius: 9, marginBottom: 12, fontSize: 16 }} />
          <button disabled={loading} style={{ width: "100%", padding: 13, background: "#3545a5", color: "#fff", border: 0, borderRadius: 9, fontWeight: 800, cursor: "pointer" }}>{loading ? "Loading…" : "Open CRM"}</button>
        </form>
        {error && <p role="alert" style={{ color: "#b42318", lineHeight: 1.5 }}>{error}</p>}
      </section> : <>
        <section style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
          <form onSubmit={(event) => { event.preventDefault(); void load(password, search); }} style={{ display: "flex", flex: "1 1 340px", gap: 8 }}>
            <input aria-label="Search customers" placeholder="Search by name or WhatsApp number" value={search} onChange={(event) => setSearch(event.target.value)} style={{ flex: 1, minWidth: 0, padding: 12, border: "1px solid #d7deea", borderRadius: 10, fontSize: 15 }} />
            <button disabled={loading} style={{ background: "#3545a5", color: "#fff", border: 0, borderRadius: 10, padding: "0 18px", fontWeight: 700 }}>{loading ? "…" : "Search"}</button>
          </form>
          <button onClick={() => void load()} disabled={loading} style={{ background: "#fff", border: "1px solid #d7deea", borderRadius: 10, padding: "10px 14px", fontWeight: 700 }}>Refresh</button>
        </section>
        {error && <p role="alert" style={{ color: "#b42318", background: "#fff1f0", padding: 12, borderRadius: 10 }}>{error}</p>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 18, alignItems: "start" }}>
          <section style={{ background: "#fff", border: "1px solid #e5eaf2", borderRadius: 16, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 10 }}><h2 style={{ fontSize: 18, margin: 0 }}>Customer list</h2><span style={{ color: "#667085", fontSize: 13 }}>{customers.length} shown</span></div>
            {!customers.length ? <p style={{ color: "#667085", lineHeight: 1.6, padding: 10 }}>No customers recorded yet. Once Meta delivers a real WhatsApp message and the webhook processes it successfully, the contact appears here.</p> : customers.map((customer) => <button key={customer.id} onClick={() => setSelected(customer.id)} style={{ width: "100%", display: "block", textAlign: "left", background: selected === customer.id ? "#eef0ff" : "#fff", border: "1px solid " + (selected === customer.id ? "#b8c1ff" : "#edf0f5"), borderRadius: 11, padding: 13, marginBottom: 8, cursor: "pointer", color: "#172033" }}>
              <strong style={{ display: "block", marginBottom: 5 }}>{customer.name || "New WhatsApp contact"}</strong><span style={{ display: "block", color: "#667085", fontSize: 13 }}>{customer.whatsapp_number}</span><span style={{ display: "block", color: customer.marketing_opt_out ? "#b42318" : "#397458", fontSize: 12, marginTop: 7 }}>{customer.marketing_opt_out ? "Promotional messages opted out" : "No opt-out recorded"} · {customer.conversations.length} conversation(s)</span>
            </button>)}
          </section>

          <section style={{ background: "#fff", border: "1px solid #e5eaf2", borderRadius: 16, padding: 20, minWidth: 0 }}>
            {!activeCustomer ? <><h2 style={{ marginTop: 0, fontSize: 18 }}>Customer details</h2><p style={{ color: "#667085", lineHeight: 1.6 }}>Select a customer to inspect their profile and conversation history.</p></> : <>
              <h2 style={{ margin: "0 0 5px", fontSize: 22 }}>{activeCustomer.name || "New WhatsApp contact"}</h2><p style={{ margin: "0 0 18px", color: "#667085" }}>{activeCustomer.whatsapp_number}</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(125px, 1fr))", gap: 10, marginBottom: 18 }}>
                {[["Language", activeCustomer.language || "Not set"], ["Created", date(activeCustomer.created_at)], ["Marketing", activeCustomer.marketing_opt_out ? "Opted out" : "No opt-out"]].map(([label, value]) => <div key={label} style={{ background: "#f7f8fc", borderRadius: 10, padding: 12 }}><small style={{ color: "#667085" }}>{label}</small><div style={{ fontWeight: 700, marginTop: 5, overflowWrap: "anywhere" }}>{value}</div></div>)}
              </div>
              <h3 style={{ fontSize: 17, margin: "20px 0 10px" }}>Conversation history</h3>
              {!activeCustomer.conversations.length ? <p style={{ color: "#667085" }}>No conversations recorded.</p> : activeCustomer.conversations.map((conversation) => <div key={conversation.id} style={{ border: "1px solid #edf0f5", borderRadius: 12, padding: 13, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}><strong>{conversation.stage || "NEW"} · {conversation.status}</strong><span style={{ color: "#667085", fontSize: 12 }}>{date(conversation.updated_at)}</span></div>
                {conversation.active_product && <p style={{ fontSize: 13, color: "#667085" }}>Interest: {conversation.active_product}</p>}
                {!conversation.messages.length ? <p style={{ color: "#667085", fontSize: 13 }}>No messages stored.</p> : conversation.messages.map((message) => <article key={message.id} style={{ background: message.direction === "inbound" ? "#f2f5ff" : "#f0f8f4", borderRadius: 9, padding: 11, marginTop: 9 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 5 }}><strong style={{ fontSize: 11, textTransform: "uppercase", color: message.direction === "inbound" ? "#3545a5" : "#25664b" }}>{message.direction === "inbound" ? "Customer" : "AI assistant"}</strong><time style={{ fontSize: 11, color: "#667085" }}>{date(message.created_at)}</time></div><p style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.5 }}>{message.body}</p>
                </article>)}
              </div>)}
            </>}
          </section>
        </div>
      </>}
    </div>
  </main>;
}
