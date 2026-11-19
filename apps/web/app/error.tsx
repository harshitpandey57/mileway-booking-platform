'use client';
import {Button} from '@/components/ui/button';
export default function ErrorPage({reset}:{reset:()=>void}) {return <main role="alert" className="mx-auto max-w-xl px-6 py-24"><h1 className="text-3xl font-bold">We couldn’t load this page.</h1><p className="my-5">Try loading it again.</p><Button onClick={reset}>Try again</Button></main>;}
