
import type {Config} from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        body: ['Inter', 'sans-serif'],
        headline: ['Inter', 'sans-serif'],
        code: ['monospace'],
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        positive: {
          DEFAULT: 'hsl(var(--positive))',
        },
        negative: {
          DEFAULT: 'hsl(var(--negative))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        pulse_cyan: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '.5' },
        },
        blob1: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)', borderRadius: '40% 60% 70% 30% / 40% 50% 60% 50%' },
          '25%': { transform: 'translate(5%, 10%) scale(1.1)', borderRadius: '50% 40% 30% 70% / 60% 30% 70% 40%' },
          '50%': { transform: 'translate(-5%, 5%) scale(0.95)', borderRadius: '30% 60% 50% 40% / 50% 60% 30% 60%' },
          '75%': { transform: 'translate(3%, -5%) scale(1.05)', borderRadius: '60% 40% 60% 30% / 40% 50% 40% 60%' },
        },
        blob2: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)', borderRadius: '50% 50% 40% 60% / 60% 40% 60% 40%' },
          '33%': { transform: 'translate(-8%, 8%) scale(1.15)', borderRadius: '40% 60% 50% 50% / 50% 60% 40% 50%' },
          '66%': { transform: 'translate(5%, -3%) scale(0.9)', borderRadius: '60% 40% 60% 40% / 40% 50% 60% 50%' },
        },
        blob3: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1) rotate(0deg)', borderRadius: '50% 50% 50% 50%' },
          '25%': { transform: 'translate(10%, -8%) scale(1.1) rotate(90deg)', borderRadius: '60% 40% 60% 40%' },
          '50%': { transform: 'translate(-5%, 10%) scale(0.95) rotate(180deg)', borderRadius: '40% 60% 40% 60%' },
          '75%': { transform: 'translate(-8%, -3%) scale(1.05) rotate(270deg)', borderRadius: '55% 45% 55% 45%' },
        },
        blob4: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)', opacity: '1' },
          '30%': { transform: 'translate(-10%, 5%) scale(1.2)', opacity: '0.8' },
          '60%': { transform: 'translate(5%, -8%) scale(0.85)', opacity: '1' },
        },
        blob5: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1) rotate(0deg)' },
          '50%': { transform: 'translate(8%, -5%) scale(1.15) rotate(120deg)' },
        },
        'bar-flash': {
          '0%, 100%': { backgroundColor: 'transparent' },
          '15%': { backgroundColor: 'rgba(16, 185, 129, 0.15)' },
          '50%': { backgroundColor: 'rgba(16, 185, 129, 0.06)' },
          '85%': { backgroundColor: 'rgba(16, 185, 129, 0.12)' },
        },
        marquee: {
          '0%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'pulse-cyan': 'pulse_cyan 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'blob-1': 'blob1 20s ease-in-out infinite',
        'blob-2': 'blob2 25s ease-in-out infinite',
        'blob-3': 'blob3 22s ease-in-out infinite',
        'blob-4': 'blob4 18s ease-in-out infinite',
        'blob-5': 'blob5 28s ease-in-out infinite',
        'bar-flash': 'bar-flash 2s ease-in-out 5',
        marquee: 'marquee 30s linear infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;
