import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Test mode (`npm run dev:emulator`): the page talks to the local Firebase emulators through this
// same address, so browsers that block other ports (and phones on the same Wi-Fi) still work.
const emulatorProxy = {
  '/identitytoolkit.googleapis.com': 'http://127.0.0.1:9099',
  '/securetoken.googleapis.com': 'http://127.0.0.1:9099',
  '/emulator': 'http://127.0.0.1:9099',
  '/google.firestore.v1.Firestore': { target: 'http://127.0.0.1:8080', ws: true },
  '/demo-suseela': 'http://127.0.0.1:5001',
  '/v0': 'http://127.0.0.1:9199',
}

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: mode === 'emulator' ? { proxy: emulatorProxy } : undefined,
}))
