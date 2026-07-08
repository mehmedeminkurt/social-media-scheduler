"use client";
import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { isApiSuccess, type ApiResponse } from "@/lib/api-response";

type ResetPasswordResponse = ApiResponse<{ message: string }>;

function ResetForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!token) {
      setError("Geçersiz veya eksik token!");
      return;
    }

    setMessage("Şifreniz güncelleniyor...");

    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });

    const data = (await res.json()) as ResetPasswordResponse;

    if (isApiSuccess(data)) {
      setMessage("Şifreniz başarıyla güncellendi! Giriş sayfasına yönlendiriliyorsunuz...");
      setTimeout(() => router.push("/login"), 2000);
    } else {
      setError(data.error || "Bir hata oluştu.");
      setMessage("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-8 border rounded shadow-md max-w-sm mx-auto mt-10">
      <h1 className="text-xl font-bold">Yeni Şifreni Belirle</h1>

      {error && <p className="text-red-500 text-sm text-center">{error}</p>}

      {message && !error && (
        <p className="text-green-600 text-sm text-center">{message}</p>
      )}

      <input
        type="password"
        placeholder="Yeni Şifre"
        required
        onChange={(e) => setPassword(e.target.value)}
        className="border p-2 rounded"
      />

      <button className="bg-green-500 text-white p-2 rounded hover:bg-green-600 transition">
        Şifreyi Güncelle
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div>Yükleniyor...</div>}>
      <ResetForm />
    </Suspense>
  );
}