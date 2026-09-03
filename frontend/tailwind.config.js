/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter Variable",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      colors: {
        /**
         * Design system — clean marketplace look (Uber-style):
         * near-black ink, white surfaces, #F6F6F6 canvas, one strong
         * blue accent (#276EF1), black primary buttons that shift to
         * blue on hover, and a disciplined status trio.
         */
        brand: {
          50: "#EEF5FF",
          100: "#D9E8FF",
          200: "#B4D1FF",
          300: "#84B4FF",
          400: "#5296FF",
          500: "#276EF1", // signature blue
          600: "#1F5AD1",
          700: "#1A4AAD",
          800: "#163C8A",
          900: "#12306E",
        },
        ok: {
          50: "#E9F9F1",
          100: "#CFF0DF",
          200: "#9FE1C2",
          300: "#63CE9E",
          400: "#2BB878",
          500: "#05A357", // success green
          600: "#048448",
          700: "#03683A",
          800: "#02522D",
          900: "#013D22",
        },
        night: {
          500: "#545454",
          700: "#2B2B2B",
          800: "#1A1A1A",
          900: "#000000", // ink
          950: "#000000",
        },
        canvas: "#F6F6F6",
        line: "#E2E2E2",
        muted: "#757575",
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        pop: "0 4px 16px rgba(0,0,0,.16)",
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "1rem",
      },
      letterSpacing: {
        tightest: "-0.03em",
      },
    },
  },
  plugins: [],
};
