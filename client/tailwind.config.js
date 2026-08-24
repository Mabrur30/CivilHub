export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#0A0A0B",
        surface: "#161617",
        primary: "#E11D2E",
        glow: "#FF3B4E",
        muted: "#3A1418",
      },
      fontFamily: {
        heading: ['"Playfair Display"', "serif"],
        body: ['"Open Sans"', "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 30px rgba(255, 59, 78, 0.35)",
      },
    },
  },
  plugins: [],
};
