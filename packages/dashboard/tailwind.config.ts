import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        cortex: {
          bg: 'var(--bg)',
          bg2: 'var(--bg2)',
          bg3: 'var(--bg3)',
          surface: 'var(--surface)',
          surface2: 'var(--surface2)',
          border: 'var(--border)',
          border2: 'var(--border2)',
          text: 'var(--text)',
          text2: 'var(--text2)',
          text3: 'var(--text3)',
          accent: 'var(--accent)',
          accent2: 'var(--accent2)',
          accent3: 'var(--accent3)',
          green: 'var(--green)',
          amber: 'var(--amber)',
          red: 'var(--red)',
          indigo: 'var(--indigo)',
          teal: 'var(--teal)',
        },
      },
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        serif: ['Fraunces', 'serif'],
        mono: ['DM Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
