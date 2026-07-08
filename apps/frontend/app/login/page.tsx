"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(""); 
  const [message, setMessage] = useState(""); 
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("Giriş yapılıyor...");

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (res?.error) {
      setError(res.error === "CredentialsSignin" ? "Email veya şifre hatalı!" : res.error);
      setMessage("");
    } else {
      setMessage("Giriş başarılı! Yönlendiriliyorsunuz...");
	  setTimeout(() => router.push("/"), 2000); 
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-8 border rounded shadow-md max-w-sm mx-auto mt-10">
      <h1 className="text-xl font-bold">Giriş Yap</h1>
      
      {/* Hata Mesajı */}
      {error && <p className="text-red-500 text-sm text-center">{error}</p>}
      
      {/* Durum Mesajı */}
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
      
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm text-blue-600 hover:underline">
          Şifremi unuttum?
        </Link>
      </div>

      <button type="submit" className="bg-blue-500 text-white p-2 rounded hover:bg-blue-600 transition">
        Giriş Yap
      </button>
    </form>
  );
}