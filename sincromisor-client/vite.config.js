import { defineConfig } from 'vite';
import { resolve } from 'path';
import handlebars from 'vite-plugin-handlebars';
import fs from 'fs';
import yaml from 'js-yaml';

function toLowerCaseKeys(arr) {
    return arr.map(obj => {
        return Object.fromEntries(
            Object.entries(obj).map(([key, value]) => [key.toLowerCase(), value])
        );
    });
}
const config = yaml.load(fs.readFileSync('../config.yml', 'utf-8'));
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
                character_glass: resolve(contents_src, 'character-glass/index.html')
            }
        }
    },
    define: {
        'import.meta.env.RTC_SERVER_URL': JSON.stringify(config['Worker']['Sincromisor'][0]['url']),
        'import.meta.env.RTC_ICE_SERVERS': JSON.stringify(toLowerCaseKeys(config['WebRTC']['RTCIceServers']))
    }
});
