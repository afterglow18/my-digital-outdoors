import React from "react";
import { Link, useLocation } from "wouter";
import { Shirt, Sparkles, Bookmark, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGetWardrobeStats } from "@/hooks/useLocalDB";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const { data: stats } = useGetWardrobeStats();

  const wardrobeCount = stats?.byCategory
    ? stats.byCategory
        .filter((c: { category: string }) =>
          ["outfits", "beauty", "toiletries", "essentials"].includes(c.category)
        )
        .reduce((sum: number, c: { count: number }) => sum + c.count, 0)
    : undefined;

  const navItems = [
    { href: "/",         label: "Garage",   icon: Shirt,    badge: wardrobeCount },
    { href: "/generate", label: "Generate", icon: Sparkles  },
    { href: "/saved",    label: "Saved",    icon: Bookmark  },
    { href: "/account",  label: "Settings", icon: Settings  },
  ];

  return (
    <div className="min-h-[100dvh] w-full flex bg-[#f8f9fa]">

      {/* ── Left Sidebar — iPad & desktop (md+) ─────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-[220px] shrink-0 bg-background border-r-[3px] border-black sticky top-0 h-[100dvh] z-50">
        {/* App title */}
        <div className="px-5 py-5 border-b-[3px] border-black">
          <p className="font-display font-black text-xl uppercase tracking-tight leading-[0.9]">
            My<br />Outdoors
          </p>
        </div>

        {/* Nav items */}
        <ul className="flex flex-col p-3 gap-1.5 flex-1">
          {navItems.map((item) => {
            const isActive = location === item.href;
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 w-full px-3.5 py-3 rounded-xl border-[2.5px] transition-all duration-200",
                    isActive
                      ? "bg-primary border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] font-bold"
                      : "border-transparent hover:bg-muted font-semibold"
                  )}
                >
                  <Icon
                    className={cn(
                      "w-5 h-5 shrink-0",
                      isActive ? "text-black" : "text-muted-foreground",
                      item.href === "/generate" && isActive ? "animate-pulse" : ""
                    )}
                    strokeWidth={isActive ? 2.5 : 2}
                  />
                  <span className="text-sm uppercase tracking-wider">{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="ml-auto bg-secondary text-white text-[10px] font-bold border-2 border-black min-w-[20px] h-5 flex items-center justify-center rounded-full px-1 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* ── Content column ──────────────────────────────────────────────────── */}
      {/* Phone (<md): centered max-w-md  |  iPad/desktop (md+): fills sidebar remainder */}
      <div className="flex-1 flex justify-center md:justify-start">
        <div className="w-full max-w-md md:max-w-none bg-background h-[100dvh] relative overflow-hidden flex flex-col">

          {/* Page content */}
          <main className="flex-1 overflow-y-auto pb-[90px] md:pb-0 relative">
            {children}
          </main>

          {/* ── Bottom nav — phone only (<md) ── */}
          <nav className="md:hidden absolute bottom-0 left-0 right-0 bg-white border-t-[3px] border-black p-3 pb-safe z-[40]">
            <ul className="flex items-center justify-around">
              {navItems.map((item) => {
                const isActive = location === item.href;
                const Icon = item.icon;
                return (
                  <li key={item.href} className="relative">
                    <Link href={item.href} className="flex flex-col items-center gap-1 group">
                      <div
                        className={cn(
                          "p-2.5 rounded-full border-2 transition-all duration-200 ease-spring relative",
                          isActive
                            ? "bg-primary border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] -translate-y-1"
                            : "bg-transparent border-transparent group-hover:bg-muted group-active:scale-95"
                        )}
                      >
                        <Icon
                          className={cn(
                            "w-6 h-6",
                            isActive ? "text-black" : "text-muted-foreground",
                            item.href === "/generate" && isActive ? "animate-pulse" : ""
                          )}
                          strokeWidth={isActive ? 2.5 : 2}
                        />
                        {item.badge !== undefined && item.badge > 0 && (
                          <div className="absolute -top-2 -right-2 bg-secondary text-black text-[10px] font-bold border-2 border-black w-5 h-5 flex items-center justify-center rounded-full shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
                            {item.badge > 99 ? "99+" : item.badge}
                          </div>
                        )}
                      </div>
                      <span
                        className={cn(
                          "text-[10px] font-bold uppercase tracking-wider transition-colors",
                          isActive ? "text-black" : "text-muted-foreground"
                        )}
                      >
                        {item.label}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </div>
    </div>
  );
}
