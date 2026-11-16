import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        bg: '#090d16',
        surface: '#111827',
        panel: '#172033',
        border: '#24314a',
        accent: '#3b82f6',
      },
    },
  },
  plugins: [],
};

export default config;
