import { type ReactElement } from "react";

interface ClientStat {
  label: string;
  value: string;
  detail: string;
}
interface ClientActivity {
  message: string;
  timestamp: string;
  type: "success" | "review" | "bid" | "message";
}

const stats: ClientStat[] = [
  { label: "Active Projects", value: "3", detail: "2 on track" },
  { label: "Pending Bid Reviews", value: "5", detail: "Across 2 projects" },
  { label: "Unread Messages", value: "7", detail: "From your project teams" },
  { label: "Total Spent", value: "$1.8M", detail: "This financial year" },
];
const activities: ClientActivity[] = [
  {
    message: "New bid received on Northline By-Pass",
    timestamp: "2 hours ago",
    type: "bid",
  },
  {
    message: "Milestone approved: Survey package",
    timestamp: "5 hours ago",
    type: "success",
  },
  {
    message: "New message from Morgan Rivera",
    timestamp: "Yesterday",
    type: "message",
  },
  {
    message: "Structural design review is ready",
    timestamp: "2 days ago",
    type: "review",
  },
  {
    message: "Payment milestone recorded",
    timestamp: "3 days ago",
    type: "success",
  },
];
const activityColors: Record<ClientActivity["type"], string> = {
  success: "bg-emerald-400",
  review: "bg-amber-300",
  bid: "bg-primary",
  message: "bg-sky-400",
};

export function ClientOverviewPage(): ReactElement {
  return (
    <div className="space-y-10">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">
          Client workspace
        </p>
        <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Your projects, in focus.
        </h1>
        <p className="mt-3 max-w-2xl text-white/60">
          Track delivery, review new partners, and keep every decision moving.
        </p>
      </div>
      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Client dashboard summary"
      >
        {stats.map((stat) => (
          <article
            key={stat.label}
            className="rounded-2xl border border-white/10 bg-surface p-5 transition-transform duration-300 hover:-translate-y-1"
          >
            <p className="text-sm text-white/55">{stat.label}</p>
            <p className="mt-4 font-heading text-4xl font-bold text-primary">
              {stat.value}
            </p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-white/40">
              {stat.detail}
            </p>
          </article>
        ))}
      </section>
      <section className="max-w-3xl rounded-2xl border border-white/10 bg-surface p-6 sm:p-8">
        <div className="border-b border-white/10 pb-5">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
            Your timeline
          </p>
          <h2 className="mt-2 font-heading text-3xl font-bold text-white">
            Recent Activity
          </h2>
        </div>
        <div className="divide-y divide-white/10">
          {activities.map((activity) => (
            <div
              key={`${activity.message}-${activity.timestamp}`}
              className="flex gap-4 py-5"
            >
              <span
                className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${activityColors[activity.type]}`}
              />
              <div className="flex-1 sm:flex sm:justify-between sm:gap-4">
                <p className="text-sm font-semibold text-white/85">
                  {activity.message}
                </p>
                <p className="mt-1 text-xs text-white/40 sm:mt-0">
                  {activity.timestamp}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
