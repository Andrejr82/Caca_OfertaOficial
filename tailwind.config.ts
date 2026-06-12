import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"]
      },
      colors: {
        ink: "#f1f5f9",
        paper: "#060a13",
        moss: "#10b981",
        leaf: "#34d399",
        gold: "#fbbf24",
        clay: "#f87171",
        fog: "#1e293b",
        surface: "#0c1020",
        elevated: "#111827",
        subtle: "#151c2e",
        "border-glass": "rgba(255, 255, 255, 0.06)",
        "accent-glow": "rgba(16, 185, 129, 0.15)"
      },
      boxShadow: {
        panel: "0 4px 24px rgba(0, 0, 0, 0.25)",
        glass: "0 8px 40px rgba(0, 0, 0, 0.35), 0 0 20px rgba(16, 185, 129, 0.08)",
        glow: "0 0 20px rgba(16, 185, 129, 0.08)",
        "glow-hover": "0 0 30px rgba(16, 185, 129, 0.14)",
        "card-hover": "0 8px 40px rgba(0, 0, 0, 0.35), 0 0 30px rgba(16, 185, 129, 0.14)"
      },
      animation: {
        fadeIn: "fadeIn 0.4s ease-out both",
        slideUp: "slideUp 0.5s ease-out both",
        slideRight: "slideRight 0.3s ease-out both",
        shimmer: "shimmer 2s linear infinite",
        pulseGlow: "pulseGlow 2s ease-in-out infinite"
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" }
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" }
        },
        slideRight: {
          from: { opacity: "0", transform: "translateX(-12px)" },
          to: { opacity: "1", transform: "translateX(0)" }
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" }
        },
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 4px rgba(16, 185, 129, 0.15)" },
          "50%": { boxShadow: "0 0 16px rgba(16, 185, 129, 0.3)" }
        }
      }
    }
  },
  plugins: [forms]
};

export default config;
