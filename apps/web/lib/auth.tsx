'use client';
import React,{createContext,useContext,useCallback,useEffect,useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import type {SessionUser} from '@mileway/shared';
import {api,ApiError} from './api';

type AuthState={user:SessionUser|null;loading:boolean;refresh:()=>Promise<void>;logout:()=>Promise<void>};
const AuthContext=createContext<AuthState|null>(null);
export function AuthProvider({children}:{children:React.ReactNode}){
  const [user,setUser]=useState<SessionUser|null>(null);
  const [loading,setLoading]=useState(true);
  const client=useQueryClient();
  const refresh=useCallback(async()=>{
    try{const value=await api<SessionUser>('/auth/me');setUser(value);}
    catch(err){if(err instanceof ApiError && err.status===401)setUser(null);else throw err;}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void refresh().catch(()=>{});},[refresh]);
  const logout=useCallback(async()=>{await api('/auth/logout',{method:'POST'});client.clear();setUser(null);},[client]);
  return <AuthContext.Provider value={{user,loading,refresh,logout}}>{children}</AuthContext.Provider>;
}
export function useAuth(){const ctx=useContext(AuthContext);if(!ctx)throw new Error('Missing AuthProvider');return ctx;}
