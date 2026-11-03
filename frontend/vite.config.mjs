import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
const frontend=fileURLToPath(new URL('.',import.meta.url));
const pkg=fileURLToPath(new URL('../pkg',import.meta.url));
export default defineConfig({root:frontend,base:'/',resolve:{alias:{'@':frontend+'src','@wasm/rhwp.js':pkg+'/rhwp.js','@wasm':pkg}},define:{__APP_VERSION__:JSON.stringify('0.8.7'),__RHWP_DISABLE_EXTERNAL_WEBFONTS__:'true',__RHWP_HWPCTRL__:'false'},build:{outDir:'../dist',emptyOutDir:true},server:{fs:{allow:[frontend,pkg]}}});
