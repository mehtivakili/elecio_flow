/** Palette lifted from Elecio Manager (source 2) — dark slate base, ice text, iris action, rose accent. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        night: '#253237',     // primaryDark — app background
        deep: '#1C272B',      // sunken panels
        slate: '#5C6B73',     // primary — borders, quiet fills
        mist: '#9DB4C0',      // primaryOther — secondary text
        frost: '#C2DFE3',     // seconary — soft highlight
        ink: '#E0FBFC',       // primaryLight — main text, light buttons
        iris: '#779BE7',      // primaryActive — actions, focus
        rose: '#FF499E',      // primaryAccent — accent & critical
        mint: '#0FD69D',      // success
        amber: '#F5B85A',     // warning
        lilac: '#B48CF2',
        sky: '#5EC8E5',
        line: '#2E424D',      // hairlines (custom-sider border)
      },
      fontFamily: { sans: ['IRANSansX', 'Vazirmatn', 'Tahoma', 'sans-serif'] },
      boxShadow: {
        glass: '0 18px 40px -18px rgba(10, 18, 22, 0.9)',
        'custom-hover': '-8px 0px 32px 2px #5C6B7360',
        glow: '0 0 0 1px rgba(119,155,231,.35), 0 8px 28px -8px rgba(119,155,231,.55)',
      },
      keyframes: {
        'bg-move': { '0%, 100%': { backgroundPosition: '0% 50%' }, '50%': { backgroundPosition: '100% 50%' } },
        'border-spin': { to: { '--angle': '360deg' } },
        'fade-up': { from: { opacity: 0, transform: 'translateY(6px)' }, to: { opacity: 1, transform: 'none' } },
        pulseScale: { '0%, 100%': { transform: 'scale(1)', opacity: 1 }, '50%': { transform: 'scale(1.05)', opacity: 0.5 } },
      },
      animation: {
        'bg-move': 'bg-move 6.6s linear infinite',
        'fade-up': 'fade-up .25s ease-out both',
        pulseScale: 'pulseScale 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
