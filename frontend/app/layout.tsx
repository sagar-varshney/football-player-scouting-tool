import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Player Scouting Tool",
  description: "Premier League player similarity and scouting intelligence dashboard.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
