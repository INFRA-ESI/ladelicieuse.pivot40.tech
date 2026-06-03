import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        display: ["Cormorant Garamond", "Georgia", "serif"],
        body: ["Lato", "-apple-system", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        olive: {
          DEFAULT: "hsl(var(--olive))",
          light: "hsl(var(--olive-light))",
        },
        tomato: {
          DEFAULT: "hsl(var(--tomato))",
          dark: "hsl(var(--tomato-dark))",
        },
        sepia: {
          DEFAULT: "hsl(var(--sepia))",
          light: "hsl(var(--sepia-light))",
        },
        cream: {
          DEFAULT: "hsl(var(--cream))",
          dark: "hsl(var(--cream-dark))",
        },
        linen: "hsl(var(--linen))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
        elevated: "var(--shadow-elevated)",
        warm: "var(--shadow-warm)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-in-right": {
          "0%": { opacity: "0", transform: "translateX(30px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "caret-blink": {
          "0%, 70%, 100%": { opacity: "1" },
          "20%, 50%": { opacity: "0" },
        },
        "otp-shake": {
          "0%, 100%": { transform: "translateX(0)" },
          "15%":       { transform: "translateX(-7px)" },
          "30%":       { transform: "translateX(7px)" },
          "45%":       { transform: "translateX(-5px)" },
          "60%":       { transform: "translateX(5px)" },
          "75%":       { transform: "translateX(-3px)" },
          "90%":       { transform: "translateX(3px)" },
        },
        "otp-pop": {
          "0%":   { transform: "scale(0.85)", opacity: "0" },
          "60%":  { transform: "scale(1.05)" },
          "100%": { transform: "scale(1)",   opacity: "1" },
        },
      },
      animation: {
        "fade-up":      "fade-up 0.6s ease-out",
        "fade-in":      "fade-in 0.5s ease-out",
        "slide-in-right": "slide-in-right 0.5s ease-out",
        "caret-blink":  "caret-blink 1.2s ease-out infinite",
        "otp-shake":    "otp-shake 0.5s ease-out",
        "otp-pop":      "otp-pop 0.25s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
