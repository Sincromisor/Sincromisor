import { defineConfig } from 'vite';
import { resolve } from 'path';
import handlebars from 'vite-plugin-handlebars';

export default defineConfig({
    appType: 'mpa',
    server: {
        open: true,
    },
    plugins: [
        handlebars({
            partialDirectory: resolve(__dirname, 'src/partials')
        })
    ],
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                simple: resolve(__dirname, 'simple.html'),
                single: resolve(__dirname, 'single.html'),
                double: resolve(__dirname, 'double.html'),
                glass: resolve(__dirname, 'glass.html')
            }
        }
    }
});
