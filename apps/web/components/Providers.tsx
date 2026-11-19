'use client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {useState} from 'react';
import {Toaster} from 'sonner';
import {AuthProvider} from '@/lib/auth';
export default function Providers({children}:{children:React.ReactNode}){const [client]=useState(()=>new QueryClient({defaultOptions:{queries:{retry:1,staleTime:15000,refetchOnWindowFocus:false}}}));return <QueryClientProvider client={client}><AuthProvider>{children}</AuthProvider><Toaster richColors position="bottom-center"/></QueryClientProvider>;}
