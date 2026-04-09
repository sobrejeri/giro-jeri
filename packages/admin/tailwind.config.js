/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#FF6A00',
          50:  '#FFF4EC',
          100: '#FFE3CC',
          200: '#FFC799',
          300: '#FFAA66',
          400: '#FF8D33',
          500: '#FF6A00',
          600: '#CC5500',
          700: '#994000',
        },
      },
      fontFamily: {
        sans:    ['Plus Jakarta Sans', 'ui-sans-serif', 'system-ui'],
        display: ['Syne', 'ui-sans-serif', 'system-ui'],
      },
    },
  },
  plugins: [],
}
