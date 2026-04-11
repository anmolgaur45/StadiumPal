import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StadiumPal",
  description: "Your AI stadium companion",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-white" suppressHydrationWarning>{children}</body>
    </html>
  );
}
