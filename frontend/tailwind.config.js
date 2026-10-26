/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { 950: "#0B1F33", 900: "#0F2A43", 700: "#2B4560", 500: "#5B7188", 400: "#8497AA", 300: "#B5C1CD" },
        teal: { 50: "#E8F5F5", 100: "#CFEBEB", 500: "#14999B", 600: "#0F8588", 700: "#0B6B6E" },
        surface: { DEFAULT: "#FFFFFF", soft: "#F4F6F8", line: "#E3E8EE" },
      },
      fontFamily: {
        sans: ['"Inter"', "ui-sans-serif", "system-ui", "-apple-system", '"Segoe UI"', "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};
