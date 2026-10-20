export default function HomePage() {
  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 18px", boxSizing: "border-box", background: "#f6f7fb", color: "#172033" }}>
      <section style={{ width: "100%", maxWidth: 760, background: "#ffffff", border: "1px solid #e4e8f0", borderRadius: 20, padding: "clamp(24px, 5vw, 48px)", boxSizing: "border-box", boxShadow: "0 12px 36px rgba(20, 32, 60, 0.06)" }}>
        <p style={{ margin: "0 0 12px", color: "#5967a8", fontWeight: 800, letterSpacing: "0.08em", fontSize: 12 }}>KINGDOM AI ACADEMY · SALES ASSISTANT</p>
        <h1 style={{ margin: "0 0 16px", fontSize: "clamp(30px, 5vw, 44px)", lineHeight: 1.12 }}>A smarter conversation. A clearer next step.</h1>
        <p style={{ margin: "0 0 18px", fontSize: 17, lineHeight: 1.7, color: "#4b5568" }}>
          This is the independent WhatsApp AI sales assistant for Kingdom AI Academy. It welcomes prospective learners, understands what they want to achieve with AI, answers questions, addresses concerns honestly, and helps them decide whether the training is right for them.
        </p>
        <p style={{ margin: "0 0 26px", fontSize: 15, lineHeight: 1.7, color: "#4b5568" }}>
          WhatsApp is the conversation and sales funnel. Registration, current course details, fees and payment are handled separately on the official Academy website. This site is not a student dashboard or course-support platform.
        </p>
        <a href="https://kingdom-ai-academy.vercel.app/auth/register?utm_source=whatsapp&utm_medium=chat&utm_campaign=academy_admissions" style={{ display: "inline-block", background: "#3545a5", color: "#fff", textDecoration: "none", fontWeight: 800, padding: "13px 18px", borderRadius: 10 }}>
          View course and registration
        </a>
        <p style={{ margin: "28px 0 0", paddingTop: 18, borderTop: "1px solid #edf0f5", fontSize: 13, lineHeight: 1.6, color: "#687287" }}>
          The assistant responds to WhatsApp messages through the configured Meta webhook. Actual message delivery and AI-provider availability must be verified before launch.
        </p>
      </section>
    </main>
  );
}
