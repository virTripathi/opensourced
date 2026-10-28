/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        notion: {
          bg: {
            light: '#ffffff',
            dark: '#191919',
          },
          card: {
            light: '#ffffff',
            dark: '#202020',
          },
          hover: {
            light: '#f7f7f5',
            dark: '#252525',
          },
          border: {
            light: '#e9e9e7',
            dark: '#2e2e2e',
          },
          text: {
            light: '#37352f',
            dark: '#ebebeb',
          },
          muted: {
            light: '#787774',
            dark: '#9b9a97',
          },
        },
      },
    },
  },
  plugins: [],
};
