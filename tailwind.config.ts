import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        "2xl": "1280px"
      }
    },
    extend: {
      colors: {
        brand: {
          50: "#f8fafc",
          100: "#e2e8f0",
          500: "#0f172a",
          600: "#0b1120",
          700: "#020617"
        }
      },
      borderRadius: {
        xl: "1rem"
      },
      boxShadow: {
        card: "0 20px 45px -20px rgba(15, 23, 42, 0.25)"
      }
    }
  },
  plugins: [require("tailwindcss-animate")]
};

export default config;
