"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";

/* ──────────────────────────────────────────────
   Types
────────────────────────────────────────────── */
interface UploadedMedia {
  id: string;          // MediaAsset.id from DB
  localId: string;     // stable key for React
  originalUrl: string; // public S3 URL
  previewUrl: string;  // object URL for thumbnail
  name: string;
  type: "image" | "video";
  order: number;
  /** Present only before upload completes — stripped from state after publish flow */
  _file?: File;
}

type Step = "form" | "uploading" | "publishing" | "done" | "error";

const InstagramIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-pink-400">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.051.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
  </svg>
);

const PLATFORMS = [
  { id: "instagram", label: "Instagram", icon: <InstagramIcon /> },
];

const MAX_CAPTION = 2200;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"];

/* ──────────────────────────────────────────────
   Helpers
────────────────────────────────────────────── */
function generateLocalId() {
  return Math.random().toString(36).slice(2);
}

/* ──────────────────────────────────────────────
   Page
────────────────────────────────────────────── */
export default function NewPostPage() {
  const { status } = useSession({ required: true });
  const router = useRouter();

  /* form state */
  const [caption, setCaption] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["instagram"]);

  /* media state */
  const [mediaItems, setMediaItems] = useState<UploadedMedia[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  /* drag-to-sort state */
  const dragIndexRef = useRef<number | null>(null);
  const dragOverIndexRef = useRef<number | null>(null);

  /* step / progress */
  const [step, setStep] = useState<Step>("form");
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [errorMessage, setErrorMessage] = useState("");

  /* cleanup preview URLs */
  useEffect(() => {
    return () => {
      mediaItems.forEach((m) => URL.revokeObjectURL(m.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── platform toggle ── */
  function togglePlatform(id: string) {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  /* ── file picking ── */
  const handleFiles = useCallback((files: File[]) => {
    const errors: string[] = [];
    const accepted: File[] = [];
    const totalAllowed = 10;
    const currentCount = mediaItems.length;

    if (currentCount >= totalAllowed) {
      setFileErrors(["Bir gönderiye en fazla 10 adet medya ekleyebilirsiniz."]);
      return;
    }

    for (const file of files) {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        errors.push(`"${file.name}" desteklenmiyor. JPEG, PNG, WebP, MP4 veya MOV yükleyin.`);
        continue;
      }
      if (file.size > 100 * 1024 * 1024) {
        errors.push(`"${file.name}" 100 MB sınırını aşıyor.`);
        continue;
      }
      accepted.push(file);
    }

    const remainingSlots = totalAllowed - currentCount;
    if (accepted.length > remainingSlots) {
      errors.push(`Limit aşıldı: Sadece ilk ${remainingSlots} dosya eklendi. (Maksimum 10 medya)`);
      accepted.splice(remainingSlots);
    }

    setFileErrors(errors);

    if (accepted.length === 0) return;

    setMediaItems((prev) => {
      const base = prev.length;
      const newItems = accepted.map((file, i) => ({
        id: "",                                 // filled after upload
        localId: generateLocalId(),
        originalUrl: "",
        previewUrl: URL.createObjectURL(file),
        name: file.name,
        type: file.type.startsWith("video/") ? ("video" as const) : ("image" as const),
        order: base + i,
        _file: file,                            // temporary, stripped after upload
      }));
      return [...prev, ...newItems] as UploadedMedia[];
    });
  }, [mediaItems]);

  /* drop zone */
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(false);
      const files = Array.from(e.dataTransfer.files);
      handleFiles(files);
    },
    [handleFiles],
  );

  /* ── drag-to-sort handlers ── */
  function onSortDragStart(e: React.DragEvent, index: number) {
    dragIndexRef.current = index;
    e.dataTransfer.effectAllowed = "move";
  }

  function onSortDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    const from = dragIndexRef.current;
    const to = index;

    if (from === null || from === to) return;

    setMediaItems((prev) => {
      const next = [...prev];
      const moved = next.splice(from, 1)[0];
      if (!moved) return prev;
      next.splice(to, 0, moved);
      return next.map((item, i) => ({ ...item, order: i }));
    });

    dragIndexRef.current = to;
  }

  function onSortDragEnd() {
    dragIndexRef.current = null;
    dragOverIndexRef.current = null;
  }

  function removeMedia(localId: string) {
    setMediaItems((prev) => {
      const item = prev.find((m) => m.localId === localId);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev
        .filter((m) => m.localId !== localId)
        .map((m, i) => ({ ...m, order: i }));
    });
  }

  /* ── main publish flow ── */
  async function handlePublish() {
    if (!caption.trim()) { setFileErrors(["Caption boş olamaz."]); return; }
    if (selectedPlatforms.length === 0) { setFileErrors(["En az bir platform seçin."]); return; }
    if (mediaItems.length === 0) { setFileErrors(["En az bir medya ekleyin."]); return; }

    setFileErrors([]);
    setErrorMessage("");

    try {
      /* Step 1 – create post (DRAFT) */
      setStep("uploading");
      const createRes = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption, platforms: selectedPlatforms }),
      });
      const createJson = await createRes.json() as { success: boolean; data?: { id: string }; error?: string };
      if (!createRes.ok || !createJson.success || !createJson.data) {
        throw new Error(createJson.error ?? "Gönderi oluşturulamadı.");
      }
      const postId = createJson.data.id;

      /* Step 2 – upload media in order */
      const uploadedIds: string[] = [];
      setUploadProgress({ done: 0, total: mediaItems.length });

      for (const item of mediaItems) {
        const file = item._file;
        if (!file) throw new Error(`"${item.name}" için dosya bulunamadı.`);
        const fd = new FormData();
        fd.append("file", file);

        const uploadRes = await fetch(`/api/posts/${postId}/media`, { method: "POST", body: fd });
        const uploadJson = await uploadRes.json() as { success: boolean; data?: { id: string }; error?: string };
        if (!uploadRes.ok || !uploadJson.success || !uploadJson.data) {
          throw new Error(uploadJson.error ?? `"${item.name}" yüklenemedi.`);
        }
        uploadedIds.push(uploadJson.data.id);
        setUploadProgress((prev) => ({ ...prev, done: prev.done + 1 }));
      }

      /* Step 3 – publish */
      setStep("publishing");
      const publishRes = await fetch(`/api/posts/${postId}/publish`, { method: "POST" });
      const publishJson = await publishRes.json() as { success: boolean; error?: string };
      if (!publishRes.ok || !publishJson.success) {
        throw new Error(publishJson.error ?? "Yayın başarısız oldu.");
      }

      /* Done — navigate to detail */
      setStep("done");
      router.push(`/posts/${postId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Beklenmedik bir hata oluştu.";
      setErrorMessage(message);
      setStep("error");
    }
  }

  /* ──────────────────────────────────────────────
     Loading guard
  ────────────────────────────────────────────── */
  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-950">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  /* ──────────────────────────────────────────────
     Progress overlay
  ────────────────────────────────────────────── */
  if (step === "uploading" || step === "publishing" || step === "done") {
    const label =
      step === "done"
        ? "Yönlendiriliyor…"
        : step === "publishing"
          ? "Yayınlanıyor…"
          : `Medya yükleniyor… ${uploadProgress.done}/${uploadProgress.total}`;

    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 gap-6">
        <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-zinc-300 text-lg font-medium tracking-wide">{label}</p>
        {step === "uploading" && uploadProgress.total > 0 && (
          <div className="w-64 h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 transition-all duration-300"
              style={{ width: `${(uploadProgress.done / uploadProgress.total) * 100}%` }}
            />
          </div>
        )}
      </div>
    );
  }

  /* ──────────────────────────────────────────────
     Main form
  ────────────────────────────────────────────── */
  const isMultiMedia = mediaItems.length > 1;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
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
            <h1 className="text-lg font-semibold text-zinc-100">Yeni Gönderi</h1>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 flex flex-col gap-8">

        {/* Error banner */}
        {step === "error" && (
          <div className="flex items-start gap-3 bg-red-950/60 border border-red-800 text-red-300 rounded-xl px-5 py-4">
            <svg className="mt-0.5 shrink-0" width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-11.25a.75.75 0 011.5 0v4.5a.75.75 0 01-1.5 0v-4.5zm.75 7.5a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
            </svg>
            <div>
              <p className="font-medium text-sm">Hata oluştu</p>
              <p className="text-sm mt-0.5 text-red-400">{errorMessage}</p>
              <button
                onClick={() => setStep("form")}
                className="mt-2 text-xs underline text-red-300 hover:text-red-100 transition-colors"
              >
                Tekrar dene
              </button>
            </div>
          </div>
        )}

        {/* ── Section 1: Platforms ── */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">Platform</h2>
          <div className="flex flex-wrap gap-3">
            {PLATFORMS.map((p) => {
              const active = selectedPlatforms.includes(p.id);
              return (
                <button
                  key={p.id}
                  id={`platform-${p.id}`}
                  onClick={() => togglePlatform(p.id)}
                  className={`flex items-center gap-2.5 px-5 py-3 rounded-xl border text-sm font-medium transition-all duration-200 ${
                    active
                      ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-900/40"
                      : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  {p.icon}
                  {p.label}
                  {active && (
                    <svg className="ml-1" width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M2.5 7L5.5 10L11.5 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-zinc-500 mt-3">LinkedIn desteği Faz 3&apos;te eklenecek.</p>
        </section>

        {/* ── Section 2: Media ── */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Medya</h2>
            {isMultiMedia && (
              <span className="text-xs text-indigo-400 bg-indigo-950/60 border border-indigo-800 px-2.5 py-1 rounded-full">
                Sürükle &amp; bırak ile sırala
              </span>
            )}
          </div>

          {/* Drop zone */}
          <label
            id="media-dropzone"
            onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
            onDragLeave={() => setIsDraggingOver(false)}
            onDrop={onDrop}
            className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200 ${
              isDraggingOver
                ? "border-indigo-500 bg-indigo-950/30"
                : "border-zinc-700 hover:border-zinc-500 bg-zinc-800/40"
            } ${mediaItems.length > 0 ? "py-5" : "py-12"}`}
          >
            <input
              type="file"
              multiple
              accept={ACCEPTED_TYPES.join(",")}
              className="hidden"
              onChange={(e) => handleFiles(Array.from(e.target.files ?? []))}
            />
            <div className="flex flex-col items-center gap-2 text-zinc-400 select-none">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className={isDraggingOver ? "text-indigo-400" : ""}>
                <path d="M16 4v16M8 12l8-8 8 8M6 24h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="text-sm font-medium">
                {isDraggingOver ? "Bırak!" : "Sürükle & bırak veya tıkla"}
              </p>
              <p className="text-xs text-zinc-600">JPEG · PNG · WebP · MP4 · MOV &nbsp;·&nbsp; Maks 100 MB</p>
            </div>
          </label>

          {/* File errors */}
          {fileErrors.length > 0 && (
            <ul className="mt-3 space-y-1">
              {fileErrors.map((err, i) => (
                <li key={i} className="text-xs text-red-400 flex items-center gap-1.5">
                  <span className="shrink-0">⚠</span> {err}
                </li>
              ))}
            </ul>
          )}

          {/* Media grid – drag-to-sort */}
          {mediaItems.length > 0 && (
            <div className="mt-5">
              {isMultiMedia && (
                <p className="text-xs text-zinc-500 mb-3">
                  {mediaItems.length} medya • Kaydırmalı (carousel) olarak paylaşılacak
                </p>
              )}
              <div className="flex flex-wrap gap-3" style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                {mediaItems.map((item, index) => (
                  <div
                    key={item.localId}
                    draggable
                    onDragStart={(e) => onSortDragStart(e, index)}
                    onDragOver={(e) => onSortDragOver(e, index)}
                    onDragEnd={onSortDragEnd}
                    className="group relative w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden border border-zinc-700 cursor-grab active:cursor-grabbing select-none transition-all duration-150 hover:border-indigo-500 hover:shadow-lg hover:shadow-indigo-900/20"
                    title="Sıralamak için sürükle"
                    style={{
                      position: "relative",
                      width: "112px",
                      height: "112px",
                      borderRadius: "12px",
                      overflow: "hidden",
                      border: "1px solid #3f3f46",
                      cursor: "grab",
                      userSelect: "none"
                    }}
                  >
                    {/* Thumbnail */}
                    {item.type === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.previewUrl}
                        alt={item.name}
                        className="absolute inset-0 w-full h-full object-cover"
                        draggable={false}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: "100%",
                          objectFit: "cover"
                        }}
                      />
                    ) : (
                      <>
                        <video
                          src={item.previewUrl}
                          preload="metadata"
                          muted
                          playsInline
                          className="absolute inset-0 w-full h-full object-cover"
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            height: "100%",
                            objectFit: "cover"
                          }}
                        />
                        {/* Video indicator badge */}
                        <div
                          className="absolute bottom-1.5 right-1.5 bg-black/70 backdrop-blur-sm px-1.5 py-0.5 rounded text-[10px] font-semibold text-zinc-300 flex items-center gap-1 border border-white/10 z-[2]"
                          style={{
                            position: "absolute",
                            bottom: "6px",
                            right: "6px",
                            backgroundColor: "rgba(0, 0, 0, 0.7)",
                            backdropFilter: "blur(4px)",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            fontSize: "10px",
                            fontWeight: 600,
                            color: "#d4d4d8",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                            zIndex: 2
                          }}
                        >
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                          <span>Video</span>
                        </div>
                      </>
                    )}

                    {/* Order badge */}
                    <div className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full bg-black/70 backdrop-blur-sm flex items-center justify-center text-xs font-bold text-white border border-white/10">
                      {index + 1}
                    </div>

                    {/* Drag handle overlay */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="white">
                        <circle cx="7" cy="5" r="1.5" />
                        <circle cx="13" cy="5" r="1.5" />
                        <circle cx="7" cy="10" r="1.5" />
                        <circle cx="13" cy="10" r="1.5" />
                        <circle cx="7" cy="15" r="1.5" />
                        <circle cx="13" cy="15" r="1.5" />
                      </svg>
                    </div>

                    {/* Remove button */}
                    <button
                      onClick={() => removeMedia(item.localId)}
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 backdrop-blur-sm flex items-center justify-center text-zinc-300 hover:text-white hover:bg-red-600/80 transition-all opacity-0 group-hover:opacity-100"
                      title="Kaldır"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ── Section 3: Caption ── */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Açıklama</h2>
            <span className={`text-xs tabular-nums ${caption.length > MAX_CAPTION * 0.9 ? "text-amber-400" : "text-zinc-500"}`}>
              {caption.length} / {MAX_CAPTION}
            </span>
          </div>
          <textarea
            id="caption-input"
            value={caption}
            onChange={(e) => setCaption(e.target.value.slice(0, MAX_CAPTION))}
            placeholder="Gönderi açıklamasını buraya yaz…"
            rows={5}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 resize-none transition-colors"
          />
          {caption.length > MAX_CAPTION * 0.9 && caption.length <= MAX_CAPTION && (
            <p className="text-xs text-amber-400 mt-2">Karakter limitine yaklaşıyorsunuz.</p>
          )}
        </section>

        {/* ── Publish button ── */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="px-5 py-2.5 rounded-xl border border-zinc-700 text-sm text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-all"
          >
            İptal
          </button>

          <button
            id="publish-button"
            onClick={handlePublish}
            disabled={step !== "form" && step !== "error"}
            className="flex items-center gap-2.5 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white font-semibold text-sm transition-all duration-200 shadow-lg shadow-indigo-900/30 hover:shadow-indigo-800/50"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M13.5 2.5L7 9M13.5 2.5H9.5M13.5 2.5V6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M6.5 3.5H3a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1V9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Yayınla
          </button>
        </div>
      </main>
    </div>
  );
}
