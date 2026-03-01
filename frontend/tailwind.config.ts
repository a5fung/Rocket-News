import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Dashboard palette
        surface: {
          DEFAULT: '#0f1117',
          raised: '#161b22',
          border: '#21262d',
        },
        bull: {
          DEFAULT: '#22c55e',
          muted: '#166534',
        },
        bear: {
          DEFAULT: '#ef4444',
          muted: '#7f1d1d',
        },
        accent: {
          DEFAULT: '#3b82f6',
          muted: '#1d4ed8',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
