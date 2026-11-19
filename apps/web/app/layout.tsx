import type {Metadata} from 'next';
import '@fontsource-variable/inter';
import './globals.css';
import Providers from '@/components/Providers';
import SiteChrome from '@/components/SiteChrome';
export const metadata: Metadata={title:{default:'Mileway | Intercity bus travel',template:'%s | Mileway'},description:'Explore intercity routes and book a demo bus journey with Mileway.'};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en-IN"><body><Providers><SiteChrome>{children}</SiteChrome></Providers></body></html>;}
