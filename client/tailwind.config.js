/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        pearl: {
          50: "#f6f7fb",
          100: "#eceef6",
          200: "#d5dbeb",
          300: "#b0bbd8",
          400: "#8593c1",
          500: "#6572ac",
          600: "#515b90",
          700: "#434a75",
          800: "#3b4063",
          900: "#343854",
        },
      },
    },
  },
  plugins: [],
};
