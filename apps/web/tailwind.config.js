/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        page: '#f8f9fb',
        surface: '#ffffff',
        primary: {
          DEFAULT: '#5a67d8',
          hover: '#4c58c9',
          soft: '#e8eaff',
        },
        lavender: '#e0e0ff',
        ink: {
          heading: '#1a202c',
          body: '#4a5568',
          muted: '#718096',
        },
        border: {
          DEFAULT: '#e2e8f0',
        },
      },
      borderRadius: {
        card: '22px',
        md: '14px',
      },
      boxShadow: {
        card: '0 4px 24px rgba(15, 23, 42, 0.06)',
        soft: '0 2px 8px rgba(15, 23, 42, 0.04)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      spacing: {
        sidebar: '76px',
      },
    },
  },
  plugins: [],
};
