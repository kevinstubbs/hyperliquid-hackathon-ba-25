/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        purple: {
          500: '#667eea',
          600: '#5a67d8',
          700: '#4c51bf',
        },
        indigo: {
          600: '#764ba2',
          700: '#6b4193',
        },
      },
    },
  },
  plugins: [],
}
