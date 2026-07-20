"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

interface PostSummary {
  id: string;
  caption: string;
  status: string;
  createdAt: string;
  mediaCount: number;
}

export default function DashboardPage() {
  const { data: session, status } = useSession({ required: true });
  const router = useRouter();
  const [recentPosts, setRecentPosts] = useState<PostSummary[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);

  // Fetch recent posts
  useEffect(() => {
    if (status !== "authenticated") return;

    fetch("/api/posts")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data)) {
          const sorted = [...data.data]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 5);
          setRecentPosts(sorted);
        }
      })
      .catch((err) => console.error("Error fetching posts:", err))
      .finally(() => setIsLoadingPosts(false));
  }, [status]);

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-950 text-zinc-100">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-zinc-400 font-medium animate-pulse">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  const companyName = session?.user?.name || session?.user?.email || "Şirketim";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans flex flex-col items-center justify-start w-full selection:bg-indigo-500/30 selection:text-indigo-200 overflow-x-hidden">
      {/* Background Decorative Gradients */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-indigo-600/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-emerald-600/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <span className="text-white font-bold text-lg">S</span>
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-zinc-100 to-zinc-400 bg-clip-text text-transparent">
                Scheduler
              </span>
              <span className="text-[10px] ml-1.5 px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium uppercase tracking-wider">
                Beta
              </span>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <span className="text-sm text-zinc-400 hidden sm:inline-block font-medium">
              🏢 {companyName}
            </span>
            <Link
              href="/settings"
              className="text-sm text-zinc-300 hover:text-white transition-colors duration-200 font-medium"
            >
              Ayarlar
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="w-full max-w-7xl mx-auto px-6 py-10 relative flex-1">
        {/* Welcome Section */}
        <div className="mb-10 p-8 sm:p-10 rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900/40 to-zinc-950/80 backdrop-blur-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="max-w-3xl">
            <h1 className="text-3xl sm:text-5xl font-extrabold text-zinc-100 tracking-tight mb-4 leading-tight ml-8">
              Sosyal Medya Paylaşımlarınızı <br />
              <span className="bg-gradient-to-r from-indigo-400 to-indigo-200 bg-clip-text text-transparent">
                Otomatize Edin
              </span>
            </h1>
            <p className="text-zinc-400 text-base sm:text-lg mb-8 leading-relaxed max-w-2xl ml-8">
              Instagram gönderileri ve Reels videoları planlayın, yayınlayın ve durumlarını tek bir arayüzden takip edin.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                href="/posts/new"
                className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-lg shadow-indigo-600/25 transition-all duration-200 hover:-translate-y-0.5 flex items-center gap-2"
              >
                <span>✨ Yeni Gönderi Oluştur</span>
              </Link>
              <Link
                href="/settings"
                className="px-6 py-3 rounded-xl bg-zinc-900/50 hover:bg-zinc-900 text-zinc-200 hover:text-white font-semibold transition-all duration-200 border border-zinc-800 flex items-center gap-2"
              >
                <span>⚙️ Hesap Bağla</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Active Services — single full-width card */}
        <div className="mb-10">
          <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-all duration-200 mt-8">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block mb-3 mt-4 ml-8">
              Aktif Servisler / Platformlar
            </span>
            <div className="flex items-center gap-3 ml-8">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-yellow-500 via-red-500 to-purple-600 p-0.5 flex items-center justify-center shadow-lg shadow-pink-500/10">
                <div className="w-full h-full bg-zinc-900 rounded-[5px] flex items-center justify-center">
                  <svg
                    width="18"
                    height="18"
                    className="w-[18px] h-[18px] text-pink-500"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.051.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                  </svg>
                </div>
              </div>
              <div className="flex items-baseline gap-2.5">
                <span className="text-xl font-bold text-zinc-100">Instagram</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 font-semibold tracking-wide uppercase mr-1">
                  Aktif
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Recent Posts */}
          <div className="lg:col-span-2 space-y-5">
            <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
              <span>📋</span> Son Gönderiler
            </h2>

            {isLoadingPosts ? (
              <div className="flex items-center justify-center p-16 rounded-2xl bg-zinc-900/50 border border-zinc-800">
                <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : recentPosts.length === 0 ? (
              <div className="text-center p-16 rounded-2xl bg-zinc-900/50 border border-dashed border-zinc-800">
                <p className="text-zinc-500 text-sm mb-4">Henüz hiç gönderi oluşturulmadı.</p>
                <Link
                  href="/posts/new"
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs font-semibold transition-all border border-zinc-800"
                >
                  İlk Gönderini Oluştur
                </Link>
              </div>
            ) : (
              <div className="rounded-2xl bg-zinc-900/50 border border-zinc-800 divide-y divide-zinc-800/60 overflow-hidden">
                {recentPosts.map((post) => (
                  <div key={post.id} className="p-5 flex items-center justify-between hover:bg-zinc-900/80 transition-colors">
                    <div className="min-w-0 flex-1 pr-4">
                      <div className="flex items-center gap-2.5 mb-2">
                        <span className={`text-[9px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider border ${
                          post.status === "PUBLISHED"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : post.status === "PUBLISHING"
                            ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20 animate-pulse"
                            : post.status === "FAILED"
                            ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                            : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        }`}>
                          {post.status}
                        </span>
                        <span className="text-[11px] text-zinc-500">
                          {new Date(post.createdAt).toLocaleDateString("tr-TR")}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-zinc-200 truncate">
                        {post.caption || "Açıklama belirtilmemiş"}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 px-2">
                      <span className="text-xs text-zinc-500 bg-zinc-900/80 px-2.5 py-1.5 rounded-lg border border-zinc-800 font-medium">
                        📁 {post.mediaCount} Medya
                      </span>
                      <Link
                        href={`/posts/${post.id}`}
                        className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                      >
                        👁️
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Başlarken — sidebar */}
          <div className="space-y-5">
            <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
              <span>🚀</span> Başlarken
            </h2>

            <div className="flex flex-col gap-4">
              <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition duration-200 flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center font-bold text-base">
                  1
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-200 mb-1">Hesabınızı Bağlayın</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Ayarlar sayfasından Facebook sayfanız üzerinden yönettiğiniz Instagram Business/Creator hesabınızı bağlayın.
                  </p>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition duration-200 flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center font-bold text-base">
                  2
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-200 mb-1">Gönderiyi Tasarlayın</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Yeni Gönderi sayfasına geçip görsellerinizi veya Reels videolarınızı yükleyip sıralayın.
                  </p>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition duration-200 flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center font-bold text-base">
                  3
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-200 mb-1">Paylaşımı Başlatın</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Yayınla butonuna basarak anında ve arka planda güvenli polling akışı ile yayına girmesini sağlayın.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
