import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
 base:'/PLOTWEAVER/',
 plugins:[react(), VitePWA({
  registerType:'autoUpdate', includeAssets:['icon.svg'],
  manifest:{name:'PLOTWEAVER — TRPG 서사 설계',short_name:'PLOTWEAVER',start_url:'/PLOTWEAVER/',scope:'/PLOTWEAVER/',display:'standalone',lang:'ko',theme_color:'#202335',background_color:'#f7f6f3',icons:[{src:'icon.svg',sizes:'any',type:'image/svg+xml'}]},
  workbox:{globPatterns:['**/*.{js,css,html,svg}']}
 })]
});