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
        ink: "#f4f7f9",
        paper: "#06131f",
        moss: "#13c98b",
        leaf: "#35e0aa",
        gold: "#f4b740",
        clay: "#f87171",
        fog: "#21617d",
        surface: "#0b2235",
        elevated: "#123651",
        subtle: "#194966",
        "border-glass": "rgba(180, 220, 235, 0.18)",
        "accent-glow": "rgba(19, 201, 139, 0.18)"
      },
      boxShadow: {
        panel: "0 4px 24px rgba(0, 0, 0, 0.25)",
        glass: "0 8px 40px rgba(0, 0, 0, 0.35), 0 0 20px rgba(19, 201, 139, 0.1)",
        glow: "0 0 20px rgba(19, 201, 139, 0.1)",
        "glow-hover": "0 0 30px rgba(19, 201, 139, 0.18)",
        "card-hover": "0 8px 40px rgba(0, 0, 0, 0.35), 0 0 30px rgba(19, 201, 139, 0.18)"
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
          "0%, 100%": { boxShadow: "0 0 4px rgba(19, 201, 139, 0.18)" },
          "50%": { boxShadow: "0 0 16px rgba(19, 201, 139, 0.34)" }
        }
      }
    }
  },
  plugins: [forms]
};

export default config;
