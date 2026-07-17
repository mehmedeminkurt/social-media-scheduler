"use client";

import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

interface PlatformConfig {
  clientId: string;
  clientSecret: string;
  hasSecret: boolean;
  isSaving: boolean;
  saveStatus: "idle" | "success" | "error";
  errorMessage: string;
  showSecret: boolean;
}

interface ConnectedAccount {
  platform: string;
  externalId: string;
  tokenExpiresAt: string | null;
  createdAt: string;
}

const MASK_STRING = "••••••••••••••••";

// useSearchParams, Suspense sınırı içinde kullanılması gerektiğinden
// asıl mantığı SettingsContent'e taşıyıp dışarıda Suspense ile sarıyoruz.
export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen bg-zinc-950 text-zinc-100">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-zinc-400 font-medium animate-pulse">Yükleniyor...</p>
          </div>
        </div>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const { status } = useSession({ required: true });
  const router = useRouter();
  const searchParams = useSearchParams();

  const [origin, setOrigin] = useState("http://localhost:3000");
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([]);

  const [instagram, setInstagram] = useState<PlatformConfig>({
    clientId: "",
    clientSecret: "",
    hasSecret: false,
    isSaving: false,
    saveStatus: "idle",
    errorMessage: "",
    showSecret: false,
  });

  const [linkedin, setLinkedin] = useState<PlatformConfig>({
    clientId: "",
    clientSecret: "",
    hasSecret: false,
    isSaving: false,
    saveStatus: "idle",
    errorMessage: "",
    showSecret: false,
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  // URL param'larından OAuth geri bildirim bildirimini göster
  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");

    if (connected) {
      const platformLabel = connected === "instagram" ? "Instagram" : "LinkedIn";
      setNotification({
        type: "success",
        message: `${platformLabel} hesabı başarıyla bağlandı!`,
      });
      // Temiz URL'e geç
      router.replace("/settings");
    } else if (error) {
      setNotification({ type: "error", message: error });
      router.replace("/settings");
    }

    if (connected || error) {
      const timer = setTimeout(() => setNotification(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [searchParams, router]);

  // Platform kimlik bilgilerini yükle
  useEffect(() => {
    if (status !== "authenticated") return;

    const fetchSettings = async () => {
      try {
        const res = await fetch("/api/settings/social-apps");
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          interface FetchedConfig {
            platform: string;
            clientId: string;
            hasSecret: boolean;
          }
          const instaData = json.data.find(
            (d: FetchedConfig) => d.platform === "instagram",
          );
          const linkedinData = json.data.find(
            (d: FetchedConfig) => d.platform === "linkedin",
          );

          if (instaData) {
            setInstagram((prev) => ({
              ...prev,
              clientId: instaData.clientId,
              clientSecret: instaData.hasSecret ? MASK_STRING : "",
              hasSecret: instaData.hasSecret,
            }));
          }
          if (linkedinData) {
            setLinkedin((prev) => ({
              ...prev,
              clientId: linkedinData.clientId,
              clientSecret: linkedinData.hasSecret ? MASK_STRING : "",
              hasSecret: linkedinData.hasSecret,
            }));
          }
        }
      } catch (err) {
        console.error("Failed to load settings:", err);
      }
    };

    fetchSettings();
  }, [status]);

  // Bağlı hesap durumunu yükle
  useEffect(() => {
    if (status !== "authenticated") return;

    const fetchConnected = async () => {
      try {
        const res = await fetch("/api/settings/connected-accounts");
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setConnectedAccounts(json.data as ConnectedAccount[]);
        }
      } catch (err) {
        console.error("Failed to load connected accounts:", err);
      }
    };

    fetchConnected();
  }, [status]);

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-950 text-zinc-100">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-zinc-400 font-medium animate-pulse">
            Yükleniyor...
          </p>
        </div>
      </div>
    );
  }

  const handleSave = async (platform: "instagram" | "linkedin") => {
    const config = platform === "instagram" ? instagram : linkedin;
    const setConfig = platform === "instagram" ? setInstagram : setLinkedin;

    setConfig((prev) => ({
      ...prev,
      isSaving: true,
      saveStatus: "idle",
      errorMessage: "",
    }));

    try {
      const res = await fetch("/api/settings/social-apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          clientId: config.clientId,
          clientSecret: config.clientSecret,
        }),
      });

      const json = await res.json();

      if (json.success) {
        setConfig((prev) => ({
          ...prev,
          isSaving: false,
          saveStatus: "success",
          hasSecret: true,
          clientSecret: MASK_STRING,
        }));
        setTimeout(() => {
          setConfig((prev) => ({ ...prev, saveStatus: "idle" }));
        }, 3000);
      } else {
        setConfig((prev) => ({
          ...prev,
          isSaving: false,
          saveStatus: "error",
          errorMessage: json.error || "Beklenmedik bir hata oluştu.",
        }));
      }
    } catch {
      setConfig((prev) => ({
        ...prev,
        isSaving: false,
        saveStatus: "error",
        errorMessage: "Bağlantı hatası oluştu.",
      }));
    }
  };

  const handleDisconnect = async (platform: "instagram" | "linkedin") => {
    try {
      const res = await fetch(`/api/social/${platform}/disconnect`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.success) {
        setConnectedAccounts((prev) => prev.filter((a) => a.platform !== platform));
        setNotification({
          type: "success",
          message: `${platform === "instagram" ? "Instagram" : "LinkedIn"} hesabı bağlantısı başarıyla kesildi.`,
        });
      } else {
        setNotification({
          type: "error",
          message: json.error || "Bağlantı kesilirken bir hata oluştu.",
        });
      }
    } catch {
      setNotification({
        type: "error",
        message: "Sunucuyla iletişim kurulurken bir hata oluştu.",
      });
    }
  };

  const getConnectedAccount = (platform: string) =>
    connectedAccounts.find((a) => a.platform === platform);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 border-r border-zinc-800 bg-zinc-900/50 p-6 flex flex-col justify-between">
        <div>
          <nav className="space-y-1">
            <a
              onClick={() => router.push("/")}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition cursor-pointer"
            >
              <svg
                width="20"
                height="20"
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                />
              </svg>
              Paneli Görüntüle
            </a>
            <a className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm bg-indigo-600/10 text-indigo-400 font-medium transition cursor-pointer">
              <svg
                width="20"
                height="20"
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              Platform Ayarları
            </a>
          </nav>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-6 md:p-10 max-w-4xl mx-auto w-full space-y-8">
        {/* Bildirim Banner */}
        {notification && (
          <div
            className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
              notification.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-red-500/10 border-red-500/30 text-red-300"
            }`}
          >
            {notification.type === "success" ? (
              <svg
                width="18"
                height="18"
                className="w-4.5 h-4.5 mt-0.5 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            ) : (
              <svg
                width="18"
                height="18"
                className="w-4.5 h-4.5 mt-0.5 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                />
              </svg>
            )}
            <span>{notification.message}</span>
            <button
              onClick={() => setNotification(null)}
              className="ml-auto text-current opacity-50 hover:opacity-100 transition"
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-2 bg-gradient-to-r from-white to-zinc-300 bg-clip-text text-transparent">
            Platform Ayarları
          </h1>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Sayfalarınızı bağlamak için kendi Instagram (Meta) ve LinkedIn
            Developer Console üzerinde oluşturduğunuz uygulamalarınızın (App ID
            / Client ID) kimlik bilgilerini yapılandırın.
          </p>
        </div>

        <div className="space-y-6">
          {/* ── Instagram Kartı ── */}
          <PlatformCard
            platform="instagram"
            title="Instagram"
            subtitle="Meta App OAuth entegrasyonu için kullanılır."
            icon={
              <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-yellow-500 via-red-500 to-purple-600 p-0.5 flex items-center justify-center shadow-lg shadow-pink-500/10">
                <div className="w-full h-full bg-zinc-900 rounded-[7px] flex items-center justify-center">
                  <svg
                    width="20"
                    height="20"
                    className="w-5 h-5 text-pink-500"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.051.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                  </svg>
                </div>
              </div>
            }
            config={instagram}
            setConfig={setInstagram}
            connectedAccount={getConnectedAccount("instagram")}
            redirectUri={`${origin}/api/social/instagram/callback`}
            onSave={() => handleSave("instagram")}
            onDisconnect={() => handleDisconnect("instagram")}
          />

          {/* ── LinkedIn Kartı ── */}
          <PlatformCard
            platform="linkedin"
            title="LinkedIn"
            subtitle="LinkedIn Company / Share API entegrasyonu için kullanılır."
            icon={
              <div className="w-10 h-10 rounded-lg bg-zinc-950 p-0.5 flex items-center justify-center border border-zinc-800 shadow-lg">
                <svg
                  width="24"
                  height="24"
                  className="w-6 h-6 text-[#0A66C2]"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
              </div>
            }
            config={linkedin}
            setConfig={setLinkedin}
            connectedAccount={getConnectedAccount("linkedin")}
            redirectUri={`${origin}/api/social/linkedin/callback`}
            onSave={() => handleSave("linkedin")}
            onDisconnect={() => handleDisconnect("linkedin")}
          />
        </div>
      </main>
    </div>
  );
}

// ─── Platform Card Bileşeni ───────────────────────────────────────────────────

interface PlatformCardProps {
  platform: "instagram" | "linkedin";
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  config: PlatformConfig;
  setConfig: React.Dispatch<React.SetStateAction<PlatformConfig>>;
  connectedAccount: ConnectedAccount | undefined;
  redirectUri: string;
  onSave: () => void;
  onDisconnect: () => void;
}

function PlatformCard({
  platform,
  title,
  subtitle,
  icon,
  config,
  setConfig,
  connectedAccount,
  redirectUri,
  onSave,
  onDisconnect,
}: PlatformCardProps) {
  const isConnected = !!connectedAccount;

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<"idle" | "success" | "error">("idle");
  const [testErrorMessage, setTestErrorMessage] = useState("");

  // Hesap bağlantı durumu değiştiğinde test sonucunu sıfırla
  useEffect(() => {
    setTestResult("idle");
    setTestErrorMessage("");
  }, [isConnected]);

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult("idle");
    setTestErrorMessage("");

    try {
      const res = await fetch(`/api/social/${platform}/test`, {
        method: "POST",
      });
      const json = await res.json();

      if (json.success) {
        setTestResult("success");
      } else {
        setTestResult("error");
        setTestErrorMessage(json.error || "Bağlantı doğrulaması başarısız oldu.");
      }
    } catch {
      setTestResult("error");
      setTestErrorMessage("Doğrulama isteği sırasında bağlantı hatası oluştu.");
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-xl hover:border-zinc-700/80 transition duration-300">
      {/* Kart Başlığı */}
      <div className="p-6 border-b border-zinc-800/60 bg-gradient-to-r from-zinc-900 to-zinc-900/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {icon}
          <div>
            <h2 className="text-md font-semibold text-zinc-100">{title}</h2>
            <p className="text-xs text-zinc-400">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {config.hasSecret ? (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Yapılandırıldı
            </span>
          ) : (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-800 text-zinc-500 border border-zinc-700/50">
              Yapılandırılmadı
            </span>
          )}
        </div>
      </div>

      {/* Kart İçeriği */}
      <div className="p-6 space-y-5">
        {/* App ID + Secret Giriş Alanları */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              Client / App ID
            </label>
            <input
              type="text"
              value={config.clientId}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, clientId: e.target.value }))
              }
              placeholder="Örn: 987654321098765"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition duration-150"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              Client / App Secret
            </label>
            <div className="relative">
              <input
                type={config.showSecret ? "text" : "password"}
                value={config.clientSecret}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    clientSecret: e.target.value,
                  }))
                }
                placeholder={
                  config.hasSecret ? MASK_STRING : "Secret anahtarını girin"
                }
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-3 pr-10 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition duration-150 font-mono"
              />
              <button
                type="button"
                onClick={() =>
                  setConfig((prev) => ({
                    ...prev,
                    showSecret: !prev.showSecret,
                  }))
                }
                className="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-300 transition"
              >
                {config.showSecret ? (
                  <svg
                    width="16"
                    height="16"
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                    />
                  </svg>
                ) : (
                  <svg
                    width="16"
                    height="16"
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>


        {/* Kaydetme Hatası */}
        {config.errorMessage && (
          <p className="text-xs text-red-400 font-medium bg-red-950/20 border border-red-900/30 px-3 py-2 rounded-lg">
            {config.errorMessage}
          </p>
        )}

        {/* Kaydet Butonu Satırı */}
        <div className="flex justify-between items-center">
          <div>
            {config.saveStatus === "success" && (
              <span className="text-xs text-emerald-400 font-medium flex items-center gap-1.5">
                <svg
                  width="16"
                  height="16"
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Ayarlar kaydedildi.
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onSave}
            disabled={config.isSaving}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-md shadow-indigo-600/10 hover:shadow-indigo-600/20 active:translate-y-[1px] transition duration-150 flex items-center gap-2 cursor-pointer"
          >
            {config.isSaving && (
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            {config.isSaving ? "Kaydediliyor..." : "Ayarları Kaydet"}
          </button>
        </div>

        {/* ── Hesap Bağlama Bölümü ── */}
        <div className="pt-4 border-t border-zinc-800/60">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              {isConnected ? (
                <>
                  <span className="flex h-2 w-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50 animate-pulse" />
                  <div>
                    <p className="text-xs font-semibold text-zinc-200">
                      Hesap Bağlı
                    </p>
                    <p className="text-[11px] text-zinc-500 font-mono">
                      ID: {connectedAccount!.externalId}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <span className="flex h-2 w-2 rounded-full bg-zinc-600" />
                  <p className="text-xs text-zinc-400">Henüz bağlanmadı</p>
                </>
              )}
            </div>

            <div className="flex items-center flex-wrap gap-2">
              {isConnected && (
                <>
                  <button
                    type="button"
                    onClick={handleTest}
                    disabled={isTesting}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 hover:border-zinc-700 disabled:opacity-50 transition duration-150 flex items-center gap-1.5 cursor-pointer"
                  >
                    {isTesting ? (
                      <div className="w-3.5 h-3.5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg
                        width="13"
                        height="13"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    )}
                    {isTesting ? "Test Ediliyor..." : "Bağlantıyı Test Et"}
                  </button>

                  <button
                    type="button"
                    onClick={onDisconnect}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-950/30 bg-red-950/10 text-red-400 hover:bg-red-950/20 hover:border-red-900/50 transition duration-150 flex items-center gap-1.5 cursor-pointer"
                  >
                    <svg
                      width="13"
                      height="13"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                    Bağlantıyı Kes
                  </button>
                </>
              )}

              <a
                href={`/api/social/${platform}/connect`}
                className={`text-xs font-semibold px-3.5 py-1.5 rounded-lg border transition duration-150 flex items-center gap-1.5 ${
                  config.hasSecret
                    ? isConnected
                      ? "border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-600"
                      : "border-indigo-500/50 text-indigo-400 hover:bg-indigo-500/10"
                    : "border-zinc-800 text-zinc-600 cursor-not-allowed pointer-events-none"
                }`}
                title={
                  !config.hasSecret
                    ? "Önce App ID ve Secret girerek kaydedin"
                    : undefined
                }
              >
                <svg
                  width="13"
                  height="13"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                  />
                </svg>
                {isConnected ? "Yeniden Bağla" : "Hesabı Bağla"}
              </a>
            </div>
          </div>
        </div>

        {/* Test Sonucu Bildirimi */}
        {testResult !== "idle" && (
          <div
            className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 transition-all duration-200 ${
              testResult === "success"
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                : "bg-red-500/10 border-red-500/20 text-red-300"
            }`}
          >
            {testResult === "success" ? (
              <>
                <svg
                  width="16"
                  height="16"
                  className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div>
                  <p className="font-semibold">Bağlantı Aktif & Geçerli</p>
                  <p className="text-[11px] opacity-80 mt-0.5">
                    Platform API yetkilendirmesi doğrulanmıştır. Erişim belirteci geçerlidir.
                  </p>
                </div>
              </>
            ) : (
              <>
                <svg
                  width="16"
                  height="16"
                  className="w-4 h-4 shrink-0 text-red-400 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div>
                  <p className="font-semibold">Bağlantı Geçersiz</p>
                  <p className="text-[11px] opacity-80 mt-0.5 leading-relaxed">
                    {testErrorMessage}
                  </p>
                </div>
              </>
            )}
            <button
              onClick={() => setTestResult("idle")}
              className="ml-auto opacity-50 hover:opacity-100 transition shrink-0"
            >
              <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
