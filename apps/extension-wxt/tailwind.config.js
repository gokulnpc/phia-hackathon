/** @type {import('tailwindcss').Config} */
export default {
  content: ["./entrypoints/**/*.{html,ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        mirror: {
          panel: "var(--bg)",
          bg2: "var(--bg-2)",
          card: "var(--card)",
          text: "var(--ink)",
          ink2: "var(--ink-2)",
          muted: "var(--ink-3)",
          faint: "var(--ink-3)",
          border: "var(--hair)",
          accent: "var(--accent)",
          soft: "var(--accent-soft)",
          danger: "var(--danger)",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        display: ["Instrument Serif", "ui-serif", "Georgia", "serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        panel: "16px",
        card: "14px",
        tile: "10px",
      },
      boxShadow: {
        tabbar: "0 8px 24px -12px rgba(20,18,15,.18), 0 2px 6px -2px rgba(20,18,15,.06)",
        "accent-cta": "0 10px 28px -10px rgba(138,124,224,.6)",
      },
      keyframes: {
        twinkle: {
          "0%, 100%": { opacity: "0.3", transform: "scale(0.8)" },
          "50%": { opacity: "1", transform: "scale(1.1)" },
        },
        eyebrowPulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
      },
      animation: {
        twinkle: "twinkle 2.4s ease-in-out infinite",
        "eyebrow-pulse": "eyebrowPulse 1.8s ease-in-out infinite",
      },
      maxWidth: {
        panel: "380px",
      },
    },
  },
  plugins: [],
};
