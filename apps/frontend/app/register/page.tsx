"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
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
      headers: { "Content-Type": "application/json" }, // Header eklendi
      body: JSON.stringify({ email, password }),
    });

    if (res.ok) {
      setMessage("Kayıt başarılı! Giriş sayfasına yönlendiriliyorsunuz...");
      setTimeout(() => router.push("/login"), 2000); // 2 saniye bekletip yönlendiriyoruz
    } else {
      const data = await res.json();
      setError(data.message || "Kayıt sırasında bir hata oluştu.");
      setMessage(""); // Hata varsa mesajı temizle
    }
  };

  return (
    <form onSubmit={handleRegister} className="flex flex-col gap-4 p-8 border rounded shadow-md max-w-sm mx-auto mt-10">
      <h1 className="text-xl font-bold">Kayıt Ol</h1>
      
      {/* Hata Mesajı */}
      {error && <p className="text-red-500 text-sm text-center">{error}</p>}
      
      {/* Bilgilendirme Mesajı */}
      {message && !error && (
        <p className="text-green-600 text-sm text-center">{message}</p>
      )}

      <input 
        type="email" placeholder="Email" required 
        onChange={(e) => setEmail(e.target.value)} 
        className="border p-2 rounded" 
      />
      <input 
        type="password" placeholder="Şifre" required 
        onChange={(e) => setPassword(e.target.value)} 
        className="border p-2 rounded" 
      />
      
      <button type="submit" className="bg-green-500 text-white p-2 rounded hover:bg-green-600 transition">
        Kayıt Ol
      </button>
    </form>
  );
}