export default function HomePage() {
  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 18px", boxSizing: "border-box" }}>
      <section style={{ width: "100%", maxWidth: 720, background: "#ffffff", border: "1px solid #e4e8f0", borderRadius: 20, padding: "clamp(24px, 5vw, 48px)", boxSizing: "border-box", boxShadow: "0 12px 36px rgba(20, 32, 60, 0.06)" }}>
        <p style={{ margin: "0 0 12px", color: "#5967a8", fontWeight: 700, letterSpacing: "0.08em", fontSize: 12 }}>KINGDOM AI ACADEMY</p>
        <h1 style={{ margin: "0 0 16px", fontSize: "clamp(30px, 5vw, 42px)", lineHeight: 1.15 }}>WhatsApp AI Assistant</h1>
        <p style={{ margin: "0 0 24px", fontSize: 17, lineHeight: 1.7, color: "#4b5568" }}>
          Official admissions and student-support assistant for Kingdom AI Academy. The assistant supports English and French and helps learners find course information and registration guidance.
        </p>
        <a href="https://kingdom-ai-academy.vercel.app/" style={{ display: "inline-block", background: "#3545a5", color: "#fff", textDecoration: "none", fontWeight: 700, padding: "13px 18px", borderRadius: 10 }}>
          Visit Kingdom AI Academy
        </a>
        <p style={{ margin: "28px 0 0", paddingTop: 18, borderTop: "1px solid #edf0f5", fontSize: 13, lineHeight: 1.6, color: "#687287" }}>
          This page confirms that the website root is available. WhatsApp message handling still depends on the configured Meta webhook and server-side integrations.
        </p>
      </section>
    </main>
  );
}
