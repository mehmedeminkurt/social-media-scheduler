"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { isApiSuccess, type ApiResponse } from "@/lib/api-response";

type RegisterResponse = ApiResponse<{ message: string }>;

export default function RegisterPage() {
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("Hesabınız oluşturuluyor...");

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyName, email, password }),
    });

    const data = (await res.json()) as RegisterResponse;

    if (isApiSuccess(data)) {
      setMessage("Kayıt başarılı! Giriş sayfasına yönlendiriliyorsunuz...");
      setTimeout(() => router.push("/login"), 2000);
    } else {
      setError(data.error || "Kayıt sırasında bir hata oluştu.");
      setMessage("");
    }
  };

  return (
    <form
      onSubmit={handleRegister}
      className="flex flex-col gap-4 p-8 border rounded shadow-md max-w-sm mx-auto mt-10"
    >
      <h1 className="text-xl font-bold">Kayıt Ol</h1>

      {/* Hata Mesajı */}
      {error && <p className="text-red-500 text-sm text-center">{error}</p>}

      {/* Bilgilendirme Mesajı */}
      {message && !error && (
        <p className="text-green-600 text-sm text-center">{message}</p>
      )}

      <input
        type="text"
        placeholder="Firma Adı"
        required
        onChange={(e) => setCompanyName(e.target.value)}
        className="border p-2 rounded"
      />
      <input
        type="email"
        placeholder="Email"
        required
        onChange={(e) => setEmail(e.target.value)}
        className="border p-2 rounded"
      />
      <input
        type="password"
        placeholder="Şifre"
        required
        onChange={(e) => setPassword(e.target.value)}
        className="border p-2 rounded"
      />

      <button
        type="submit"
        className="bg-green-500 text-white p-2 rounded hover:bg-green-600 transition"
      >
        Kayıt Ol
      </button>
    </form>
  );
}
