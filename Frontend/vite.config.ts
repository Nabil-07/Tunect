import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['react', 'react-dom', 'lucide-react'], // add 'framer-motion' only if you keep it
  },
  server: {
    hmr: { overlay: true },
  },
});
