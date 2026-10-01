import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import fs from 'fs'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isElectron = process.env.VITE_ELECTRON === 'true' || mode === 'electron';
  const hasCerts = fs.existsSync('./key.pem') && fs.existsSync('./cert.pem');

  return {
    base: './',
    plugins: [
      react(),
      isElectron && electron([
        {
          entry: 'electron/main.ts',
          onstart(options) {
            options.startup()
          },
          vite: {
            build: {
              outDir: 'dist-electron',
              emptyOutDir: false,
            },
          },
        },
        {
          entry: 'electron/preload.ts',
          onstart(options) {
            options.reload()
          },
          vite: {
            build: {
              outDir: 'dist-electron',
              emptyOutDir: false,
            },
          },
        },
      ]),
      isElectron && renderer(),
    ].filter(Boolean),
    server: {
      host: true,
      port: 3000,
      ...(hasCerts
        ? {
            https: {
              key: fs.readFileSync('./key.pem'),
              cert: fs.readFileSync('./cert.pem'),
            },
          }
        : {}),
      allowedHosts: ['pgray.io'],
    },
    build: {
      emptyOutDir: false,
    },
  }
})
