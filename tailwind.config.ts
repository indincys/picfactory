import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Avenir Next', 'SF Pro Display', 'Helvetica Neue', 'sans-serif']
      },
      keyframes: {
        floatin: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        }
      },
      animation: {
        floatin: 'floatin 360ms ease-out both'
      }
    }
  },
  plugins: []
} satisfies Config;
