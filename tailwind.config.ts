import { fontFamily } from 'tailwindcss/defaultTheme'

// Using an untyped export to avoid build-time type resolution issues in constrained environments.
const config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', ...fontFamily.sans] },
      keyframes: {
        'pulse-speak': { '0%,100%': { transform: 'scale(1)', opacity: '1' }, '50%': { transform: 'scale(1.15)', opacity: '.7' } },
        dash: { to: { 'stroke-dashoffset': '-8' } }
      },
      animation: {
        'pulse-speak': 'pulse-speak 1.2s ease-in-out infinite',
        dash: 'dash 1s linear infinite'
      }
    }
  },
  plugins: [],
}

export default config
