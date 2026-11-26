import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shinigami Auto-Post & Auto-Like Dashboard",
  description:
    "Dashboard serverless Next.js + Firestore + KoboiLLM untuk otomatisasi post dan like komunitas Shinigami.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="min-h-full bg-slate-950 text-slate-100 flex flex-col">
        {children}
      </body>
    </html>
  );
}
