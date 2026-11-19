import {createHash} from 'node:crypto';
import {readdirSync, readFileSync, existsSync} from 'node:fs';
import path from 'node:path';
// Exported Next pages embed a small hydration payload. Hash those exact scripts at startup.
export const webRoot = path.resolve(__dirname,'../../../web/out');
export function staticScriptHashes(dir=webRoot): string[] {
  if (!existsSync(dir)) return [];
  const hashes=new Set<string>();
  for (const item of readdirSync(dir,{withFileTypes:true})) {
    const file=path.join(dir,item.name);
    if(item.isDirectory()) { if(item.name!=='_next') for(const hash of staticScriptHashes(file)) hashes.add(hash); continue; }
    if(!item.name.endsWith('.html')) continue;
    for(const match of readFileSync(file,'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
      if(match[1]) hashes.add("'sha256-"+createHash('sha256').update(match[1]).digest('base64')+"'");
    }
  }
  return [...hashes];
}
