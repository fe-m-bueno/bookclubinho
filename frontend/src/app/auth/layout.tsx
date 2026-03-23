import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 bg-[radial-gradient(ellipse_at_top,oklch(0.94_0.03_78)_0%,oklch(0.96_0.015_78)_100%)] dark:bg-[radial-gradient(ellipse_at_top,oklch(0.20_0.015_76)_0%,oklch(0.17_0.01_75)_100%)]">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      {children}
    </div>
  );
}
