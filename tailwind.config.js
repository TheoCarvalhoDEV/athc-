/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#FCFAF7",
        surface: "#FFFFFF",
        surfaceHover: "#FAF7F2",
        primary: "#5A122E",
        primaryHover: "#400B20",
        accent: "#0B4F48",
        accentHover: "#083B36",
        textLight: "#1C1917",
        textMuted: "#78716C",
        textDark: "#FFFFFF",
        glass: "rgba(255, 255, 255, 0.65)",
        glassBorder: "rgba(28, 25, 23, 0.08)",
        danger: "#EF4444",
        success: "#10B981",
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'sans-serif'],
        display: ['Plus Jakarta Sans', 'sans-serif'],
        serifDisplay: ['Plus Jakarta Sans', 'sans-serif'],
        mono: ['Plus Jakarta Sans', 'sans-serif'],
      },
      boxShadow: {
        'glow-primary': '0 4px 20px rgba(90, 18, 46, 0.15)',
        'glow-accent': '0 4px 20px rgba(11, 79, 72, 0.15)',
        'glow-success': '0 4px 20px rgba(16, 185, 129, 0.15)',
        'glass-shadow': '0 12px 40px -10px rgba(28, 25, 23, 0.06)',
        'glow-primary-lg': '0 8px 30px rgba(90, 18, 46, 0.25)',
        'float': '0 20px 50px rgba(28, 25, 23, 0.08)',
      },
      animation: {
        'shimmer-slide': 'shimmer-slide 3s infinite',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        'skeleton': 'skeleton 1.5s ease-in-out infinite',
        'aurora-slow': 'aurora-slow 20s ease-in-out infinite alternate',
      },
      keyframes: {
        'shimmer-slide': {
          '0%': { left: '-100%' },
          '100%': { left: '200%' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 15px rgba(255, 0, 127, 0.25)' },
          '50%': { boxShadow: '0 0 25px rgba(255, 0, 127, 0.5), 0 0 50px rgba(255, 0, 127, 0.25)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        'skeleton': {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        'aurora-slow': {
          '0%': { transform: 'translate(0, 0) rotate(0deg) scale(1)' },
          '50%': { transform: 'translate(10vw, 5vh) rotate(180deg) scale(1.1)' },
          '100%': { transform: 'translate(-5vw, -5vh) rotate(360deg) scale(1)' },
        },
      },
    },
  },
  plugins: [],
}
