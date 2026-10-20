import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Kingdom AI Academy | WhatsApp Assistant",
  description: "Official Kingdom AI Academy WhatsApp admissions assistant.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "Arial, Helvetica, sans-serif", background: "#f7f8fb", color: "#172033" }}>
        {children}
      </body>
    </html>
  );
}
