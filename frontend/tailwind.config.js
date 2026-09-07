/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Jerarquía cromática:
        // brand = acciones principales; navy = información/IA; teal = Benchmark;
        // green/amber/red = estados de éxito, atención y riesgo.
        brand: {
          50: '#fef6ee',
          100: '#fde9d0',
          200: '#fbd0a0',
          300: '#f8b06a',
          400: '#f59540',
          500: '#E87A1E',   // Naranja Naturgy (mariposa)
          600: '#C96510',
          700: '#a8500d',
          800: '#874012',
          900: '#6e3612',
        },
        navy: {
          50: '#e8eef4',
          100: '#c5d4e4',
          200: '#9eb7d1',
          300: '#7499bd',
          400: '#4f7ba7',
          500: '#003E6B',   // Azul corporativo Naturgy
          600: '#003259',
          700: '#002647',
          800: '#001a35',
          900: '#000f23',
        },
        surface: {
          0: '#ffffff',
          1: '#f7f8fa',
          2: '#eef0f4',
          3: '#dde1e8',
          4: '#c5cbd6',
        },
        text: {
          primary: '#1a1a2e',
          secondary: '#5a6078',
          muted: '#8b90a0',
        },
      },
      fontFamily: {
        sans: ['"Inter"', '"Helvetica Neue"', 'Arial', 'system-ui', 'sans-serif'],
      },
      padding: {
        safe: 'env(safe-area-inset-bottom)',
      },
    },
  },
  plugins: [],
};
