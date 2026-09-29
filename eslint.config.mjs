import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  { ignores: [".next/**", "node_modules/**", "storage/**", "playwright-report/**", "test-results/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Sider, ruter og komponenter skal ikke snakke med databasen direkte.
    // Bruk src/server/queries.ts (lesing) eller funksjoner i src/server/* (skriving).
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "@/server/db", message: "Bruk src/server/queries.ts eller en funksjon i src/server/* i stedet." },
            { name: "@prisma/client", message: "Bruk src/server/* i stedet for å importere Prisma direkte." },
          ],
        },
      ],
    },
  },
];
export default config;
