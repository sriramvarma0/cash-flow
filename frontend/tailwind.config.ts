import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}', './public/**/*.html'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eefdf6',
          100: '#d5fae8',
          200: '#acf2d0',
          300: '#72e3b0',
          400: '#3ecb8e',
          500: '#17a66b',
          600: '#0f8356',
          700: '#0e6948',
          800: '#0d533c',
          900: '#0b4533'
        },
        ink: {
          50: '#f4f7f7',
          100: '#e5ecec',
          200: '#ccd8d8',
          300: '#a6bbbb',
          400: '#7d9696',
          500: '#5b7676',
          600: '#485f5f',
          700: '#3a4d4d',
          800: '#2d3c3c',
          900: '#1f2a2a'
        }
      },
      boxShadow: {
        glow: '0 20px 80px rgba(23, 166, 107, 0.18)',
        card: '0 12px 40px rgba(18, 28, 28, 0.08)'
      },
      backgroundImage: {
        'radial-soft': 'radial-gradient(circle at top, rgba(23,166,107,0.22), transparent 42%)'
      }
    }
  },
  plugins: []
};

export default config;
