import "./globals.css";
import Navigation from "@/components/Navigation";

export const metadata = {
  title: "Odoo Inventory Scanner",
  description: "Mobile-friendly barcode scanning for Odoo 17 stock counts"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="container">
          <Navigation />
          {children}
        </div>
      </body>
    </html>
  );
}
