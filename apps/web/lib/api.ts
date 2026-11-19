import {API_PREFIX} from '@mileway/shared';
const base=process.env.NEXT_PUBLIC_API_ORIGIN || (process.env.NODE_ENV==='development'?'http://localhost:4000':'');
export class ApiError extends Error { constructor(public status:number,message:string){ super(message); } }
export async function api<T>(path:string,options:RequestInit={}):Promise<T>{
  const headers=new Headers(options.headers);
  if(options.method && options.method.toUpperCase()!=='GET'){headers.set('Content-Type','application/json');headers.set('X-Mileway-Request','1');}
  const response=await fetch(base+API_PREFIX+path,{...options,headers,credentials:'include',cache:'no-store'});
  const body=await response.json().catch(()=>null);
  if(!response.ok) throw new ApiError(response.status,body?.error?.message || body?.message || 'The service is unavailable. Please try again.');
  return body?.data as T;
}
export const apiUrl=(path:string)=>base+API_PREFIX+path;
