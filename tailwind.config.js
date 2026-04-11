/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: '#131313',
        'surface-dim': '#0f0f0f',
        'surface-container-lowest': '#0e0e0e',
        'surface-container-low': '#1c1b1c',
        'surface-container': '#201f20',
        'surface-container-high': '#2a2a2a',
        'surface-container-highest': '#353535',
        primary: '#ffffff',
        'on-primary': '#2d3135',
        'primary-container': '#3a3f47',
        'on-primary-container': '#e8edf5',
        secondary: '#acc7ff',
        'on-secondary': '#1c2f4a',
        'secondary-container': '#2d4263',
        'on-secondary-container': '#d5e3ff',
        outline: '#5c5f63',
        'outline-variant': '#44474a',
        'on-surface': '#e5e2e1',
        'on-surface-variant': '#c5c6ca',
        error: '#ffb4ab',
        'error-container': '#93000a',
        accent: '#4d90fe',
        'accent-dim': '#3d7bdd',
        // Legacy compat
        background: '#131313',
        card: '#1c1b1c',
        border: '#44474a',
        text: '#e5e2e1',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Monaco', 'Consolas', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '0.125rem',
        sm: '0.125rem',
        md: '0.25rem',
        lg: '0.5rem',
        xl: '0.75rem',
        full: '9999px',
      },
    },
  },
  plugins: [],
}
