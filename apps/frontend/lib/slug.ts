// Firma adından URL-güvenli, benzersizleştirilebilir bir slug üretir.
// Türkçe karakterleri latin karşılıklarına çevirir (ç→c, ş→s, ...).
const TR_MAP: Record<string, string> = {
  ç: "c",
  ğ: "g",
  ı: "i",
  ö: "o",
  ş: "s",
  ü: "u",
  Ç: "c",
  Ğ: "g",
  İ: "i",
  Ö: "o",
  Ş: "s",
  Ü: "u",
};

export function slugify(input: string): string {
  const transliterated = input.replace(
    /[çğıöşüÇĞİÖŞÜ]/g,
    (ch) => TR_MAP[ch] ?? ch,
  );

  const slug = transliterated
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  // Ad tamamen latin-dışıysa boş kalmasın diye emniyet.
  return slug || "company";
}
