import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createAiMiddleware} from './server/ai-service.mjs';
const root=fileURLToPath(new URL('./dist/',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.wasm':'application/wasm','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2','.ttf':'font/ttf','.txt':'text/plain; charset=utf-8'};
const port=Number(process.env.PORT||7720);
const aiMiddleware=createAiMiddleware();
http.createServer((req,res)=>{
 aiMiddleware(req,res,()=>serveStatic(req,res));
}).listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`오픈소스 한글: http://${process.env.HOST||'127.0.0.1'}:${port}`));
function serveStatic(req,res){
 if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
 let requested;
 try{requested=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);res.end();return;}
 if(requested==='/healthz'){res.writeHead(200,{'Content-Type':'application/json'});res.end('{"status":"ok","service":"rhwp-workspace"}');return;}
 const file=path.resolve(root,'.'+(requested==='/'?'/index.html':requested));
 if(!file.startsWith(root)){res.writeHead(403);res.end();return;}
 fs.stat(file,(err,stat)=>{
  if(err||!stat.isFile()){res.writeHead(404);res.end('Not found');return;}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':stat.size,'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Cache-Control':requested.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-cache'});
  if(req.method==='HEAD'){res.end();return;}fs.createReadStream(file).pipe(res);
 });
}
