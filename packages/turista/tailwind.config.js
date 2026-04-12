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
        ocean: {
          DEFAULT: '#0EA5E9',
          50:  '#F0F9FF',
          100: '#E0F2FE',
          500: '#0EA5E9',
          600: '#0284C7',
        },
        sand: {
          DEFAULT: '#F59E0B',
          50:  '#FFFBEB',
          100: '#FEF3C7',
          500: '#F59E0B',
        },
      },
      fontFamily: {
        sans:    ['Plus Jakarta Sans', 'ui-sans-serif', 'system-ui'],
        display: ['Syne', 'ui-sans-serif', 'system-ui'],
      },
    },
  },
  plugins: [
    function ({ addUtilities }) {
      addUtilities({
        '.scrollbar-hide': {
          '-ms-overflow-style': 'none',
          'scrollbar-width': 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        },
        '.touch-callout-none': { '-webkit-touch-callout': 'none' },
        '.tap-highlight-none': { '-webkit-tap-highlight-color': 'transparent' },
      })
    },
  ],
}
