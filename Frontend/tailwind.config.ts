import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        lagoon: { DEFAULT: '#0E5E6F', 50: '#E7F2F4', 100: '#C9E2E7', 600: '#0E5E6F', 700: '#0A4A58', 800: '#083A45' },
        ink: { DEFAULT: '#16242C', soft: '#43545D', faint: '#566770' },
        paper: '#F5F8F7',
        mist: { DEFAULT: '#DCE8E5', strong: '#C3D5D1' },
        mango: { DEFAULT: '#F2A900', soft: '#FFF3D1', ink: '#6B4A00' },
        leaf: { DEFAULT: '#276B42', soft: '#E3F2E8' },
        danger: { DEFAULT: '#B42318', soft: '#FDECEA' },
      },
      fontFamily: { sans: ['"Archivo Variable"', 'Archivo', 'system-ui', 'sans-serif'] },
      borderRadius: { ticket: '14px' },
      boxShadow: { lift: '0 1px 0 rgba(22,36,44,0.06), 0 8px 24px -12px rgba(14,94,111,0.35)' },
    },
  },
  plugins: [],
} satisfies Config;
