import { AppShell } from "@/components/app-shell.tsx";
import { SiteHeader } from "@/features/auth/site-header.tsx";

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div
        style={{
          flexShrink: 0,
          padding: "8px 20px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          fontSize: 13,
        }}
      >
        <SiteHeader />
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <AppShell>{children}</AppShell>
      </div>
    </>
  );
}
