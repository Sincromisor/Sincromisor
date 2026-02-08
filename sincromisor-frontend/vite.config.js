import { defineConfig } from 'vite';
import { resolve, basename } from 'path';
import { readFileSync } from 'fs';

const contents_src = resolve(__dirname, 'src');
const partials_dir = resolve(__dirname, 'src/partials');

function htmlPartialsPlugin(partialDirectory) {
    const partialTagPattern = /\{\{\s*>\s*([a-zA-Z0-9_-]+)\s*\}\}/g;

    const renderPartial = (name, stack = []) => {
        const partialPath = resolve(partialDirectory, `${name}.html`);
        if (stack.includes(name)) {
            throw new Error(`[html-partials] Circular partial include detected: ${[...stack, name].join(' -> ')}`);
        }
        let source;
        try {
            source = readFileSync(partialPath, 'utf-8');
        } catch {
            throw new Error(`[html-partials] Partial "${name}" was not found`);
        }
        return source.replace(partialTagPattern, (_, nestedName) => renderPartial(nestedName, [...stack, name]));
    };

    return {
        name: 'sincromisor-html-partials',
        enforce: 'pre',
        transformIndexHtml: {
            order: 'pre',
            handler(html) {
                return html.replace(partialTagPattern, (_, partialName) => renderPartial(partialName));
            }
        },
        handleHotUpdate({ file, server }) {
            if (file.startsWith(partialDirectory) && basename(file).endsWith('.html')) {
                server.ws.send({ type: 'full-reload' });
            }
        }
    };
}

export default defineConfig({
    appType: 'mpa',
    server: {
        open: true,
    },
    plugins: [
        htmlPartialsPlugin(partials_dir)
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
                vrm360: resolve(contents_src, 'vrm360/index.html'),
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
