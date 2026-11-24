import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Radar } from "lucide-react";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { DEFAULT_TAB, isTab, type TabId } from "@/components/dashboard/tabs";
import { loadDataset } from "@/lib/load";
import { applyThemeColors, loadConfig } from "@/lib/config";
import { setMotion } from "@/lib/motion";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>): { tab?: TabId } => (isTab(s["tab"]) ? { tab: s["tab"] } : {}),
  head: () => ({
    meta: [
      { title: "Celeris Demand Control Tower" },
      { name: "description", content: "Demand forecasting control tower: history, forecast with P10–P90 range, accuracy, anomalies, what-if and procurement views." },
      { property: "og:title", content: "Celeris Demand Control Tower" },
      { property: "og:description", content: "Demand forecasting control tower: history, forecast with P10–P90 range, accuracy, anomalies, what-if and procurement views." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: "/" });
  const q = useQuery({ queryKey: ["dataset"], queryFn: loadAll, staleTime: Infinity, retry: 1 });

  if (q.isError) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold">The data didn't load</h1>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{(q.error as Error).message}</p>
        <Button className="mt-4" onClick={() => q.refetch()}>Try again</Button>
      </Shell>
    );
  }
  if (!q.data) {
    return (
      <LoadingSkeleton />
    );
  }
  const { data, config } = q.data;
  const start = isTab(config.default_tab) ? config.default_tab : DEFAULT_TAB;
  return <Dashboard data={data} config={config} tab={tab ?? start} onTab={(t) => navigate({ search: { tab: t }, replace: true })} />;
}

async function loadAll() {
  const [data, config] = await Promise.all([loadDataset(), loadConfig()]);
  setMotion(config.animation);
  applyThemeColors(config);
  return { data, config };
}

function LoadingSkeleton() {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row" aria-busy="true" aria-label="Loading demand data">
      <div className="sidebar-surface h-40 w-full shrink-0 lg:h-screen lg:w-72" />
      <div className="flex-1 space-y-4 p-6">
        <div className="flex gap-2">{Array.from({ length: 7 }, (_, i) => <div key={i} className="shimmer h-9 w-28 rounded-full" />)}</div>
        <div className="shimmer h-8 w-64 rounded-lg" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="shimmer h-24 rounded-xl" />)}</div>
        <div className="shimmer h-80 rounded-xl" />
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Radar className="size-4 animate-spin text-forecast" aria-hidden /> Loading demand data…</p>
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center">
      <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-sidebar text-sidebar-primary">
        <Radar className="size-6" aria-hidden />
      </div>
      {children}
    </div>
  );
}
