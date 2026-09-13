/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#FAF3E0',
        board: '#D9EAD3',
        tile: '#F7F1E1',
        ink: '#1F2A37',
        py: { red: '#D52B1E', blue: '#0038A8', gold: '#C9A227' },
      },
      fontFamily: { sans: ['ui-rounded', 'Nunito', 'Segoe UI', 'system-ui', 'sans-serif'] },
      boxShadow: { card: '0 4px 20px rgba(0,0,0,.12)' },
    },
  },
  plugins: [],
};
