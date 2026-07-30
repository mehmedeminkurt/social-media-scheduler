"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";

interface PostTargetSummary {
  platform: string;
  status: string;
}

interface CalendarPost {
  id: string;
  caption: string;
  status: string;
  scheduledAt: string | null;
  createdAt: string;
  mediaCount: number;
  targets: PostTargetSummary[];
}

type CalendarTone = "waiting" | "published" | "partial" | "failed";

function getPostTone(post: CalendarPost): CalendarTone {
  if (post.status === "PUBLISHED") return "published";
  if (post.status === "PARTIAL") return "partial";
  if (post.status === "FAILED") return "failed";
  return "waiting";
}

const TONE_STYLES: Record<
  CalendarTone,
  { dot: string; bar: string; label: string }
> = {
  waiting: {
    dot: "bg-orange-400",
    bar: "border-orange-500/40 bg-orange-500/10",
    label: "Bekliyor",
  },
  published: {
    dot: "bg-emerald-400",
    bar: "border-emerald-500/40 bg-emerald-500/10",
    label: "Yayınlandı",
  },
  partial: {
    dot: "bg-amber-400",
    bar: "border-amber-500/40 bg-amber-500/10",
    label: "Kısmi",
  },
  failed: {
    dot: "bg-rose-400",
    bar: "border-rose-500/40 bg-rose-500/10",
    label: "Başarısız",
  },
};

const TARGET_DOT: Record<string, string> = {
  PUBLISHED: "bg-emerald-400",
  FAILED: "bg-rose-400",
  PUBLISHING: "bg-orange-400 animate-pulse",
  SCHEDULED: "bg-orange-400",
  DRAFT: "bg-orange-300",
  PENDING_APPROVAL: "bg-violet-400",
  PARTIAL: "bg-amber-400",
};

const WEEKDAY_LABELS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function formatMonthTitle(date: Date): string {
  return date.toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
}

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function postDisplayDate(post: CalendarPost): Date {
  return new Date(post.scheduledAt ?? post.createdAt);
}

export default function CalendarPage() {
  const { status } = useSession({ required: true });
  const [posts, setPosts] = useState<CalendarPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/posts");
      const json = (await res.json()) as {
        success: boolean;
        data?: CalendarPost[];
      };
      if (json.success && Array.isArray(json.data)) {
        setPosts(json.data);
      }
    } catch (err) {
      console.error("Calendar fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    loadPosts();
  }, [status, loadPosts]);

  const postsByDay = useMemo(() => {
    const map = new Map<string, CalendarPost[]>();
    for (const post of posts) {
      const key = toDateKey(postDisplayDate(post));
      const bucket = map.get(key) ?? [];
      bucket.push(post);
      map.set(key, bucket);
    }
    return map;
  }, [posts]);

  const calendarCells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: Array<{ date: Date | null; key: string }> = [];

    for (let i = 0; i < firstWeekday; i++) {
      cells.push({ date: null, key: `pad-start-${i}` });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      cells.push({ date, key: toDateKey(date) });
    }

    while (cells.length % 7 !== 0) {
      cells.push({ date: null, key: `pad-end-${cells.length}` });
    }

    return cells;
  }, [cursor]);

  const scheduledPosts = useMemo(
    () =>
      [...posts]
        .filter((post) => post.scheduledAt || post.status === "SCHEDULED")
        .sort(
          (a, b) =>
            postDisplayDate(a).getTime() - postDisplayDate(b).getTime(),
        ),
    [posts],
  );

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-950">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-zinc-400 hover:text-white transition-colors">
              ← Ana Sayfa
            </Link>
            <h1 className="text-lg font-semibold">İçerik Takvimi</h1>
          </div>
          <Link
            href="/posts/new"
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold transition-colors"
          >
            + Yeni Gönderi
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 xl:grid-cols-3 gap-8">
        <section className="xl:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setCursor((prev) => addMonths(prev, -1))}
              className="px-3 py-2 rounded-lg border border-zinc-700 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              ←
            </button>
            <h2 className="text-xl font-bold capitalize">{formatMonthTitle(cursor)}</h2>
            <button
              onClick={() => setCursor((prev) => addMonths(prev, 1))}
              className="px-3 py-2 rounded-lg border border-zinc-700 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              →
            </button>
          </div>

          <div className="flex flex-wrap gap-4 text-xs text-zinc-400 mb-2">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-400" /> Bekliyor
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Yayınlandı
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Kısmi
            </span>
          </div>

          {loading ? (
            <div className="flex justify-center p-16 rounded-2xl bg-zinc-900/50 border border-zinc-800">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
              <div className="grid grid-cols-7 border-b border-zinc-800">
                {WEEKDAY_LABELS.map((label) => (
                  <div
                    key={label}
                    className="px-2 py-3 text-center text-xs font-semibold text-zinc-500 uppercase"
                  >
                    {label}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7">
                {calendarCells.map(({ date, key }) => {
                  if (!date) {
                    return (
                      <div
                        key={key}
                        className="min-h-28 border-b border-r border-zinc-800/60 bg-zinc-950/20"
                      />
                    );
                  }

                  const dayPosts = postsByDay.get(key) ?? [];
                  const isToday = key === toDateKey(new Date());

                  return (
                    <div
                      key={key}
                      className={`min-h-28 border-b border-r border-zinc-800/60 p-2 ${
                        isToday ? "bg-indigo-950/20" : ""
                      }`}
                    >
                      <div
                        className={`text-xs font-semibold mb-1.5 ${
                          isToday ? "text-indigo-300" : "text-zinc-400"
                        }`}
                      >
                        {date.getDate()}
                      </div>

                      <div className="space-y-1">
                        {dayPosts.slice(0, 3).map((post) => {
                          const tone = getPostTone(post);
                          const style = TONE_STYLES[tone];
                          return (
                            <Link
                              key={post.id}
                              href={`/posts/${post.id}`}
                              className={`block rounded-md border px-1.5 py-1 text-[10px] leading-tight truncate ${style.bar}`}
                              title={post.caption}
                            >
                              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${style.dot}`} />
                              {post.caption || "Gönderi"}
                            </Link>
                          );
                        })}
                        {dayPosts.length > 3 && (
                          <p className="text-[10px] text-zinc-500 px-1">
                            +{dayPosts.length - 3} daha
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-bold">Planlanmış Gönderiler</h2>

          {loading ? (
            <div className="flex justify-center p-10 rounded-2xl bg-zinc-900/50 border border-zinc-800">
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : scheduledPosts.length === 0 ? (
            <div className="p-8 rounded-2xl bg-zinc-900/50 border border-dashed border-zinc-800 text-center text-sm text-zinc-500">
              Henüz planlanmış gönderi yok.
            </div>
          ) : (
            <div className="rounded-2xl border border-zinc-800 divide-y divide-zinc-800/60 overflow-hidden">
              {scheduledPosts.map((post) => {
                const tone = getPostTone(post);
                const style = TONE_STYLES[tone];
                return (
                  <Link
                    key={post.id}
                    href={`/posts/${post.id}`}
                    className="block p-4 hover:bg-zinc-900/80 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <span
                        className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${style.bar}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                        {style.label}
                      </span>
                      <span className="text-[11px] text-zinc-500 tabular-nums">
                        {postDisplayDate(post).toLocaleString("tr-TR", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    <p className="text-sm text-zinc-200 truncate mb-2">
                      {post.caption || "Açıklama yok"}
                    </p>

                    <div className="flex items-center gap-2">
                      {post.targets.map((target) => (
                        <span
                          key={target.platform}
                          title={`${target.platform}: ${target.status}`}
                          className={`w-2 h-2 rounded-full ${
                            TARGET_DOT[target.status] ?? TARGET_DOT["DRAFT"]
                          }`}
                        />
                      ))}
                      <span className="text-[10px] text-zinc-600 ml-auto">
                        {post.mediaCount} medya
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
