/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          50: "#eef2f8",
          100: "#d6e0f0",
          200: "#adc1e1",
          500: "#24437a",
          600: "#1b3664",
          700: "#14294d",
          800: "#0e1e3a",
          900: "#091428",
          950: "#050c1a",
        },
        gold: {
          50: "#fdf8e8",
          100: "#faecc5",
          300: "#ecc86b",
          400: "#dfb141",
          500: "#c89624",
          600: "#a67917",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};

