import "./globals.css";

export const metadata = {
  title: "Odoo Inventory Scanner",
  description: "Mobile-friendly barcode scanning for Odoo 17 stock counts"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="container">{children}</div>
      </body>
    </html>
  );
}
