"use client";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("Gönderiliyor...");

    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    
    const data = await res.json();
    
    if (res.ok) {
      setMessage(data.message || "Sıfırlama linki mail adresinize gönderildi.");
      setIsError(false);
    } else {
      setMessage(data.error || "Bir hata oluştu.");
      setIsError(true);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-8 border rounded shadow-md max-w-sm mx-auto mt-10">
      <h1 className="text-xl font-bold">Şifremi Unuttum</h1>
      
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

      {/* Mesaj alanı */}
      {message && (
        <p className={`text-sm text-center ${isError ? "text-red-500" : "text-green-600"}`}>
          {message}
        </p>
      )}
    </form>
  );
}