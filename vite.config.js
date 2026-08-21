import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

function copyOfficialLogo() {
  return {
    name: 'copy-official-police-logo',
    closeBundle() {
      const source = path.resolve(process.cwd(), 'police-logo.png');
      const target = path.resolve(process.cwd(), 'dist', 'police-logo.png');
      fs.copyFileSync(source, target);
    },
  };
}

export default defineConfig({
  plugins: [react(), copyOfficialLogo()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      '/auth': 'http://localhost:3001',
    },
  },
});
