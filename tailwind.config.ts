import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: {
    colors: {
      "noxia-night":"#050812","noxia-blue":"#19BFFF","noxia-violet":"#9B4DFF",
      "noxia-silver":"#DDE5F2","noxia-ash":"#8D96A8",
      
    },
    fontFamily: { display:["Georgia","Times New Roman","serif"], sans:["system-ui","Segoe UI","sans-serif"] },
    boxShadow: { glow:"0 0 40px -8px rgba(25,191,255,.35)", "noxia":"0 0 60px -12px rgba(155,77,255,.65)" },
    keyframes: { pulseGlow:{ "0%,100%":{opacity:".5",transform:"scale(.98)"}, "50%":{opacity:"1",transform:"scale(1.02)"} } },
    animation: { pulseGlow:"pulseGlow 5s ease-in-out infinite" },
  } },
  plugins: [],
};
export default config;
