import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Higgens",
  description: "Your concierge, in your messages.",
};

const style = `
  body { font-family: Times, "Times New Roman", serif; max-width: 40em; margin: 2em auto; padding: 0 1em; line-height: 1.4; background: #fff; color: #000; }
  a { color: #00e; }
  a:visited { color: #551a8b; }
  hr { border: 0; border-top: 1px solid #000; }
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <style>{style}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
