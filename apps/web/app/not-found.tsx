import {Button} from '@/components/ui/button';
export default function NotFound(){return <main className="mx-auto max-w-xl px-6 py-24"><p className="text-primary">404</p><h1 className="mt-3 text-4xl font-bold">This stop is off the map.</h1><p className="my-6 text-muted">Check the address or start a new journey from the homepage.</p><Button asChild><a href="/">Find a bus</a></Button></main>;}
