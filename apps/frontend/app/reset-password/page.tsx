"use client";
import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function ResetForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!token) {
      setMessage("Geçersiz veya eksik token!");
      return;
    }

    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });

    if (res.ok) {
      setMessage("Şifreniz başarıyla güncellendi! Giriş sayfasına yönlendiriliyorsunuz...");
      setTimeout(() => router.push("/login"), 2000); 
    } else {
      const data = await res.json();
      setMessage(data.error || "Bir hata oluştu.");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-8 border rounded shadow-md max-w-sm mx-auto mt-10">
      <h1 className="text-xl font-bold">Yeni Şifreni Belirle</h1>
      
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

      {/* Mesaj */}
      {message && (
        <p className={`text-sm text-center ${message.includes("başarıyla") ? "text-green-600" : "text-red-500"}`}>
          {message}
        </p>
      )}
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