// lint-staged.config.cjs
// CommonJS formatı kullanılıyor: root package.json'da "type": "module" olmadığından
// .js uzantılı dosyalar CJS olarak yorumlanır; export default (ESM) yüklenemez.
// Çözüm: .cjs uzantısı + module.exports ile lint-staged her ortamda config'i okur.
//
// Fonksiyon sözdizimi tsc'nin dosya argümanı almasını engeller:
// tsc'ye tek tek dosya geçilirse tsconfig.json görmezden gelinir.
// Fonksiyon döndürülen komut, dosya listesini yok sayar.

module.exports = {
  // Frontend: ESLint (--max-warnings 0) + TypeScript tip kontrolü
  "apps/frontend/**/*.{js,ts,tsx}": [
    "npm run lint --workspace=apps/frontend",
    () => "npm run check-types --workspace=apps/frontend",
  ],

  // Worker: Yalnızca TypeScript tip kontrolü (ESLint config yok)
  "apps/worker/**/*.ts": [
    () => "npm run check-types --workspace=worker",
  ],

  // Paylaşılan paketler: varsa tip kontrolü
  "packages/**/*.ts": [
    () => "npm run check-types --workspaces --if-present",
  ],
};
