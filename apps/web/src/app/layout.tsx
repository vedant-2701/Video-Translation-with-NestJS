import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: "VideoTranslate",
    description: "AI-powered video translation powered by Sarvam AI",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" className="dark">
            <body className={`${geist.className} antialiased`}>{children}</body>
        </html>
    );
}
