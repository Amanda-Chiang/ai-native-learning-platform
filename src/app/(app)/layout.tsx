import { AppShell } from "@/components/app-shell.tsx";
import { BrandLogo } from "@/components/brand-logo.tsx";
import { SiteHeader } from "@/features/auth/site-header.tsx";

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 20px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          fontSize: 13,
        }}
      >
        <BrandLogo />
        <SiteHeader />
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <AppShell>{children}</AppShell>
      </div>
    </>
  );
}
