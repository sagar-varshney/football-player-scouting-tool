import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Football Player Scouting Tool",
  description: "Explore Premier League player similarity, percentile profiles, shot maps, and recorded-action heatmaps.",
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
