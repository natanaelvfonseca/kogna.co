import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        host: true, // Listen on all addresses
        proxy: {
            '/api': {
                target: `http://localhost:${process.env.PORT || 8080}`,
                changeOrigin: true,
                secure: false,
            },
            '/auth': {
                target: `http://localhost:${process.env.PORT || 8080}`,
                changeOrigin: true,
                secure: false,
            },
            '/chat': {
                target: `http://localhost:${process.env.PORT || 8080}`,
                changeOrigin: true,
                secure: false,
            },
            '/message': {
                target: `http://localhost:${process.env.PORT || 8080}`,
                changeOrigin: true,
                secure: false,
            }
        }
    }
})
