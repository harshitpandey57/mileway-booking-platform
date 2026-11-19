import type { Config } from 'tailwindcss';
export default { content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './features/**/*.{ts,tsx}'], theme: { extend: { colors: { primary: '#224ee8', ink: '#101e3c', muted: '#697386' } } }, plugins: [] } satisfies Config;
