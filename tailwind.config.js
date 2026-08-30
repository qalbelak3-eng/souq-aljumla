/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: '#f3f8fc', // Clean light blue-tinted background like Jumlaty
          card: '#ffffff',
          cardHover: '#f8fafc',
          border: '#e2e8f0',
          blue: '#0284c7', // Primary Jumlaty blue
          blueLight: '#38bdf8',
          blueDark: '#0369a1',
          coral: '#f05138', // Jumlaty Buy / CTA Coral Red
          coralHover: '#dc381f',
          green: '#1b4332', // Jumlaty Dark Green buttons
          greenLight: '#22c55e',
          greenDark: '#143628',
          amber: '#f59e0b', // Badges & Offers
          textDark: '#0f172a',
          textMuted: '#64748b',
        },
      },
      fontFamily: {
        sans: ['Cairo', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'soft': '0 2px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -4px rgba(0, 0, 0, 0.02)',
        'card': '0 4px 20px -2px rgba(2, 132, 199, 0.06), 0 2px 6px -1px rgba(0, 0, 0, 0.04)',
        'glow-coral': '0 4px 15px -1px rgba(240, 81, 56, 0.35)',
        'glow-blue': '0 4px 15px -1px rgba(2, 132, 199, 0.35)',
      },
    },
  },
  plugins: [],
};
