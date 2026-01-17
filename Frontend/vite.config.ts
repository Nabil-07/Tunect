import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // loadEnv uses process.cwd() internally if root is '.', which works in Node.js runtime
  const env = loadEnv(mode, '.', '');
  const proxyTarget = env.VITE_API_PROXY_TARGET || env.VITE_API_URL || 'http://localhost:3000';

  return {
    plugins: [react()],
    optimizeDeps: {
      include: ['react', 'react-dom', 'lucide-react'], // add 'framer-motion' only if you keep it
    },
    server: {
      hmr: { overlay: true },
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
        '/webrtc': {
          target: proxyTarget,
          changeOrigin: true,
          ws: true,
          secure: false,
        },
      },
    },
  };
});
