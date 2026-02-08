/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx,css}"
  ],
  theme: {
    extend: {
      colors: {
        'hygge-beige': '#F7F3F0',
        'hygge-moss': '#6B705C',
        'hygge-sage': '#A5A58D',
        'hygge-brown': '#B7B7A4',
        'hygge-earth': '#6D5959',
        'hygge-warm-grey': '#DDBEA9',
        'hygge-stone': '#CB997E',
        'hygge-nav': '#A39E93',
      },
    },
  },
  plugins: [],
}
