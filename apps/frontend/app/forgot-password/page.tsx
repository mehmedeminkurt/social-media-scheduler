"use client";
import { useState } from "react";
import { isApiSuccess, type ApiResponse } from "@/lib/api-response";

type ForgotPasswordResponse = ApiResponse<{ message: string }>;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("Gönderiliyor...");

    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const data = (await res.json()) as ForgotPasswordResponse;

    if (isApiSuccess(data)) {
      setMessage(
        data.data.message || "Sıfırlama linki mail adresinize gönderildi.",
      );
    } else {
      setError(data.error || "Bir hata oluştu.");
      setMessage("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-8 border rounded shadow-md max-w-sm mx-auto mt-10">
      <h1 className="text-xl font-bold">Şifremi Unuttum</h1>

      {error && <p className="text-red-500 text-sm text-center">{error}</p>}

      {message && !error && (
        <p className="text-green-600 text-sm text-center">{message}</p>
      )}

      <input
        type="email"
        placeholder="Kayıtlı E-postanız"
        required
        onChange={(e) => setEmail(e.target.value)}
        className="border p-2 rounded"
      />

      <button className="bg-blue-500 text-white p-2 rounded hover:bg-blue-600 transition">
        Sıfırlama Linki Gönder
      </button>
    </form>
  );
}