/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#F5ECE1", // Cream
        primary: "#6A1324",    // Burgundy
        primaryHover: "#8A1C30",
        textDark: "#2A1F1D",
        textLight: "#EAEAEA",
        accent: "#D4AF37",     // Gold accent from Velvet VIP just in case
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        serif: ['Cormorant Garamond', 'serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
