import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';
import { createAiMiddleware } from '../server/ai-service.mjs';
const frontend=fileURLToPath(new URL('.',import.meta.url));
const pkg=fileURLToPath(new URL('../pkg',import.meta.url));
export default defineConfig(({mode}) => ({root:frontend,base:'/',envDir:fileURLToPath(new URL('..',import.meta.url)),plugins:[{name:'local-ai-api',configureServer(server){const env={...loadEnv(mode,fileURLToPath(new URL('..',import.meta.url)),''),...process.env};server.middlewares.use(createAiMiddleware({env}));}}],resolve:{alias:{'@':frontend+'src','@wasm/rhwp.js':pkg+'/rhwp.js','@wasm':pkg}},define:{__APP_VERSION__:JSON.stringify('0.8.7'),__RHWP_DISABLE_EXTERNAL_WEBFONTS__:'true',__RHWP_HWPCTRL__:'false'},build:{outDir:'../dist',emptyOutDir:true},server:{fs:{allow:[frontend,pkg]}}}));
