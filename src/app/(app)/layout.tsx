import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-page">
      <Sidebar />
      <div className="pl-60">
        <Topbar userName={user.name} />
        <main className="mx-auto max-w-[1600px] px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
