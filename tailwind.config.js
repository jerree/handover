/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#FFF4EC',
          100: '#FFE8D6',
          200: '#FFD0B0',
          300: '#FFB083',
          400: '#FA8C55',
          500: '#F2671F',
          600: '#D9480F',
          700: '#B03A0C',
          800: '#8C2E0A',
          900: '#702408',
        },
        page: '#FFF8F2',
        charcoal: '#1F2937',
        muted: '#6B7280',
      },
      fontFamily: {
        sans: ['"Nunito Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
