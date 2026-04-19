import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // editorial design system
        bg: "var(--bg)",
        bg2: "var(--bg-2)",
        card: "var(--card)",
        ink: "var(--ink)",
        ink2: "var(--ink-2)",
        ink3: "var(--ink-3)",
        hair: "var(--hair)",
        danger: "var(--danger)",

        accent: "var(--accent)",
        "accent-soft": "var(--accent-soft)",

        lavender: "var(--lavender)",
        "lavender-soft": "var(--lavender-soft)",
        peach: "var(--peach)",
        "peach-soft": "var(--peach-soft)",
        sage: "var(--sage)",
        "sage-soft": "var(--sage-soft)",
        butter: "var(--butter)",
        "butter-soft": "var(--butter-soft)",
        sky: "var(--sky)",
        "sky-soft": "var(--sky-soft)",
        rose: "var(--rose)",
        "rose-soft": "var(--rose-soft)",

        // legacy aliases retained for un-touched call sites
        cream: "var(--bg)",
        warm: "var(--bg-2)",
        blush: "var(--peach-soft)",
        deep: "var(--ink)",
        gold: "var(--butter)",
        "sage-dark": "#6d7b5f",
        charcoal: "var(--ink-2)",
        muted: "var(--ink-3)",
        borderMirror: "var(--hair)",
        hoverMirror: "rgba(18,18,18,0.04)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-instrument)", "ui-serif", "Georgia", "serif"],
        mono: ["var(--font-jetbrains)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        mirror: "var(--radius)",
        "mirror-sm": "var(--radius-sm)",
        "mirror-xs": "var(--radius-xs)",
      },
      boxShadow: {
        "mirror-sm": "none",
        "mirror-md":
          "0 10px 28px -10px color-mix(in oklch, var(--accent) 65%, transparent)",
        "mirror-lg":
          "0 24px 48px -18px rgba(20,18,15,.24), 0 4px 12px -4px rgba(20,18,15,.08)",
      },
    },
  },
  plugins: [],
};
export default config;
