import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { void: "#0B0B12", crimson: "#FF2A6D", violet: "#9D4EDD", cyan: "#05D9E8" },
      fontFamily: { sans: ["Vazirmatn Variable", "Tahoma", "sans-serif"] },
    },
  },
} satisfies Config;
