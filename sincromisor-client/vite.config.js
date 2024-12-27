import { defineConfig } from 'vite';
import { resolve } from 'path';
import handlebars from 'vite-plugin-handlebars';

const contents_src = resolve(__dirname, 'src');

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
    root: contents_src,
    publicDir: resolve(__dirname, 'public'),
    build: {
        emptyOutDir: true,
        outDir: resolve(__dirname, 'dist'),
        rollupOptions: {
            input: {
                main: resolve(contents_src, 'index.html'),
                simple: resolve(contents_src, 'simple/index.html'),
                single: resolve(contents_src, 'single/index.html'),
                double: resolve(contents_src, 'double/index.html'),
                glass: resolve(contents_src, 'glass/index.html'),
                character: resolve(contents_src, 'character/index.html'),
                character_glass: resolve(contents_src, 'character-glass/index.html'),
                area360: resolve(contents_src, 'area360/index.html'),
                simple_vrm: resolve(contents_src, 'simple-vrm/index.html'),

            },
            output: {
                manualChunks: {
                    vendor: [
                        '@babylonjs/core'
                    ]
                }
            }
        }
    }
});

// babylon.js Tree Shaking
// https://doc.babylonjs.com/setup/frameworkPackages/es6Support#tree-shaking
