"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";

/* ──────────────────────────────────────────────
   Types (mirroring Prisma shapes)
────────────────────────────────────────────── */
interface MediaAsset {
  id: string;
  type: string;
  originalUrl: string;
  renderedUrl: string | null;
  order: number;
}

interface PostTarget {
  id: string;
  platform: string;
  status: string;
  externalPostId: string | null;
  error: string | null;
  attempts: number;
  updatedAt: string;
}

interface PostLog {
  id: string;
  ts: string;
  level: string;
  message: string;
}

interface Post {
  id: string;
  caption: string;
  status: string;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
  targets: PostTarget[];
  mediaAssets: MediaAsset[];
  logs: PostLog[];
}

/* ──────────────────────────────────────────────
   Helpers
────────────────────────────────────────────── */
const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  DRAFT:      { label: "Taslak",      bg: "bg-zinc-800",    text: "text-zinc-300",  dot: "bg-zinc-500" },
  SCHEDULED:  { label: "Zamanlandı", bg: "bg-blue-950/60",  text: "text-blue-300",  dot: "bg-blue-400" },
  PUBLISHING: { label: "Yayınlanıyor", bg: "bg-amber-950/60", text: "text-amber-300", dot: "bg-amber-400" },
  PUBLISHED:  { label: "Yayında",    bg: "bg-emerald-950/60", text: "text-emerald-300", dot: "bg-emerald-400" },
  FAILED:     { label: "Başarısız",  bg: "bg-red-950/60",   text: "text-red-300",   dot: "bg-red-500" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG["DRAFT"]!;
  return (
    <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.text} border-current/20`}>
      <span className={`w-2 h-2 rounded-full ${cfg.dot} ${status === "PUBLISHING" ? "animate-pulse" : ""}`} />
      {cfg.label}
    </span>
  );
}

function PlatformIcon({ platform }: { platform: string }) {
  if (platform === "instagram") return <span>📸</span>;
  if (platform === "linkedin") return <span>💼</span>;
  return <span>🌐</span>;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("tr-TR", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/* ──────────────────────────────────────────────
   Page
────────────────────────────────────────────── */
export default function PostDetailPage() {
  const { status: sessionStatus } = useSession({ required: true });
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const postId = params.id;

  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [republishing, setRepublishing] = useState(false);
  const [republishError, setRepublishError] = useState("");
  const [selectedMediaIndex, setSelectedMediaIndex] = useState(0);

  /* ── fetch post data ── */
  const fetchPost = useCallback(async () => {
    try {
      const res = await fetch(`/api/posts/${postId}`);
      const json = await res.json() as { success: boolean; data?: Post; error?: string };
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error ?? "Gönderi yüklenemedi.");
      }
      setPost(json.data);
      setFetchError("");
    } catch (err: unknown) {
      setFetchError(err instanceof Error ? err.message : "Gönderi yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [postId]);

  /* initial load */
  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    fetchPost();
  }, [sessionStatus, fetchPost]);

  /* polling while PUBLISHING */
  useEffect(() => {
    if (!post || post.status !== "PUBLISHING") return;
    const interval = setInterval(fetchPost, 5000);
    return () => clearInterval(interval);
  }, [post, fetchPost]);

  /* ── re-publish ── */
  async function handleRepublish() {
    if (!post) return;
    setRepublishing(true);
    setRepublishError("");
    try {
      const res = await fetch(`/api/posts/${postId}/publish`, { method: "POST" });
      const json = await res.json() as { success: boolean; error?: string };
      if (!res.ok || !json.success) throw new Error(json.error ?? "Yayın başarısız.");
      await fetchPost();
    } catch (err: unknown) {
      setRepublishError(err instanceof Error ? err.message : "Yayın başarısız.");
    } finally {
      setRepublishing(false);
    }
  }

  /* ──────────────────────────────────────────────
     Loading / error states
  ────────────────────────────────────────────── */
  if (sessionStatus === "loading" || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-950">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 gap-4 px-6">
        <div className="text-4xl">😕</div>
        <p className="text-zinc-300 font-medium">{fetchError}</p>
        <button
          onClick={() => router.back()}
          className="text-indigo-400 hover:text-indigo-300 text-sm underline"
        >
          Geri dön
        </button>
      </div>
    );
  }

  if (!post) return null;

  const sortedMedia = [...post.mediaAssets].sort((a, b) => a.order - b.order);
  const activeMedia = sortedMedia[selectedMediaIndex];

  /* ──────────────────────────────────────────────
     Render
  ────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="text-zinc-400 hover:text-zinc-100 transition-colors p-2 -ml-2 rounded-lg hover:bg-zinc-800"
              aria-label="Geri"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div>
              <h1 className="text-lg font-semibold leading-tight">Gönderi Detayı</h1>
              <p className="text-xs text-zinc-500">{formatDate(post.createdAt)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={post.status} />
            {post.status === "PUBLISHING" && (
              <button
                onClick={fetchPost}
                className="text-zinc-400 hover:text-zinc-100 transition-colors p-2 rounded-lg hover:bg-zinc-800"
                title="Yenile"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M13.5 8A5.5 5.5 0 112.5 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  <path d="M13.5 4V8H9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-5 gap-8">

        {/* ────────── Left column ────────── */}
        <div className="lg:col-span-3 flex flex-col gap-6">

          {/* Media viewer */}
          {sortedMedia.length > 0 && (
            <section className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
              {/* Main preview */}
              <div className="aspect-square bg-zinc-950 flex items-center justify-center relative">
                {activeMedia ? (
                  activeMedia.type === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={activeMedia.renderedUrl ?? activeMedia.originalUrl}
                      alt={`Medya ${selectedMediaIndex + 1}`}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <video
                      src={activeMedia.originalUrl}
                      controls
                      className="w-full h-full object-contain"
                    />
                  )
                ) : null}

                {/* Carousel nav */}
                {sortedMedia.length > 1 && (
                  <>
                    {selectedMediaIndex > 0 && (
                      <button
                        onClick={() => setSelectedMediaIndex((i) => i - 1)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 backdrop-blur flex items-center justify-center text-white hover:bg-black/80 transition-all"
                        aria-label="Önceki"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    )}
                    {selectedMediaIndex < sortedMedia.length - 1 && (
                      <button
                        onClick={() => setSelectedMediaIndex((i) => i + 1)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 backdrop-blur flex items-center justify-center text-white hover:bg-black/80 transition-all"
                        aria-label="Sonraki"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M6 12l4-4-4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    )}
                    {/* Dot indicators */}
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                      {sortedMedia.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setSelectedMediaIndex(i)}
                          className={`transition-all rounded-full ${
                            i === selectedMediaIndex ? "w-5 h-2 bg-white" : "w-2 h-2 bg-white/40 hover:bg-white/70"
                          }`}
                          aria-label={`Medya ${i + 1}`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Thumbnail strip */}
              {sortedMedia.length > 1 && (
                <div className="flex gap-2 p-4 overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-700">
                  {sortedMedia.map((asset, i) => (
                    <button
                      key={asset.id}
                      onClick={() => setSelectedMediaIndex(i)}
                      className={`shrink-0 relative w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                        i === selectedMediaIndex ? "border-indigo-500" : "border-zinc-700 opacity-60 hover:opacity-100"
                      }`}
                      title={`Medya ${i + 1}`}
                    >
                      {asset.type === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={asset.renderedUrl ?? asset.originalUrl}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-zinc-400">
                            <path d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-center text-[10px] text-white py-0.5">
                        {i + 1}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Caption */}
          <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Açıklama</h2>
            <p className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed">
              {post.caption || <span className="text-zinc-600 italic">Açıklama yok.</span>}
            </p>
          </section>
        </div>

        {/* ────────── Right column ────────── */}
        <div className="lg:col-span-2 flex flex-col gap-6">

          {/* Platform targets */}
          <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">Platform Hedefleri</h2>
            {post.targets.length === 0 ? (
              <p className="text-sm text-zinc-500 italic">Hedef yok.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {post.targets.map((target) => (
                  <div
                    key={target.id}
                    className="flex flex-col gap-2 p-3 rounded-xl bg-zinc-800/60 border border-zinc-700"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <PlatformIcon platform={target.platform} />
                        <span className="text-sm font-medium capitalize">{target.platform}</span>
                      </div>
                      <StatusBadge status={target.status} />
                    </div>

                    {target.externalPostId && (
                      <p className="text-xs text-zinc-400">
                        <span className="text-zinc-500">Post ID:</span>{" "}
                        <code className="text-indigo-300 font-mono">{target.externalPostId}</code>
                      </p>
                    )}

                    {target.error && (
                      <p className="text-xs text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">
                        {target.error}
                      </p>
                    )}

                    <p className="text-xs text-zinc-600">
                      Deneme: {target.attempts} &nbsp;·&nbsp; {formatDate(target.updatedAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Re-publish button */}
            {post.status === "FAILED" && (
              <div className="mt-4">
                {republishError && (
                  <p className="text-xs text-red-400 mb-2">{republishError}</p>
                )}
                <button
                  id="republish-button"
                  onClick={handleRepublish}
                  disabled={republishing}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all"
                >
                  {republishing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Yeniden yayınlanıyor…
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M11.5 7A4.5 4.5 0 112.5 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        <path d="M11.5 3.5V7H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Yeniden Yayınla
                    </>
                  )}
                </button>
              </div>
            )}
          </section>

          {/* Activity log */}
          <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">Aktivite Günlüğü</h2>
            {post.logs.length === 0 ? (
              <p className="text-sm text-zinc-500 italic">Henüz log yok.</p>
            ) : (
              <div className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-zinc-700">
                {post.logs.map((log) => (
                  <div key={log.id} className="flex gap-2.5">
                    <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                      log.level === "error" ? "bg-red-500" : "bg-emerald-400"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs leading-relaxed break-words ${
                        log.level === "error" ? "text-red-300" : "text-zinc-300"
                      }`}>
                        {log.message}
                      </p>
                      <p className="text-[10px] text-zinc-600 mt-0.5 tabular-nums">
                        {formatDate(log.ts)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Meta info */}
          <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">Bilgiler</h2>
            <dl className="flex flex-col gap-2.5 text-xs">
              <div className="flex justify-between">
                <dt className="text-zinc-500">ID</dt>
                <dd className="font-mono text-zinc-400 truncate max-w-[160px]" title={post.id}>{post.id}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Oluşturuldu</dt>
                <dd className="text-zinc-300">{formatDate(post.createdAt)}</dd>
              </div>
              {post.scheduledAt && (
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Zamanlandı</dt>
                  <dd className="text-zinc-300">{formatDate(post.scheduledAt)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-zinc-500">Medya sayısı</dt>
                <dd className="text-zinc-300">{post.mediaAssets.length}</dd>
              </div>
            </dl>
          </section>
        </div>
      </main>
    </div>
  );
}
