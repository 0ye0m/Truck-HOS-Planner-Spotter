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
        brand: {
          50: "#f0f7f4",
          100: "#dcece4",
          200: "#bcdccf",
          300: "#93c5b0",
          400: "#5aa887",
          500: "#1d7a4f",
          600: "#176140",
          700: "#134d34",
          800: "#123f2d",
          900: "#0e3325",
        },
        night: {
          700: "#263241",
          800: "#1b2430",
          900: "#121922",
          950: "#0b1016",
        },
      },
      boxShadow: {
        card: "0 1px 3px rgba(16,24,40,.06), 0 1px 2px rgba(16,24,40,.08)",
      },
    },
  },
  plugins: [],
};
