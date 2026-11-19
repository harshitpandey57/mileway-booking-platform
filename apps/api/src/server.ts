import mongoose from 'mongoose';
import {validateEnvironment} from './config/env';
import {connectDatabase} from './config/database';
import {createApp} from './app';
async function main() {
  process.env.PUBLIC_BASE_URL ||= process.env.RENDER_EXTERNAL_URL || 'http://localhost:4000';
  validateEnvironment();
  await connectDatabase(process.env.MONGODB_URI!);
  if (process.env.SEED_ON_START === 'true') {
    const {seed} = require('./seed') as {seed:()=>Promise<unknown>};
    await seed();
  }
  const port=Number(process.env.PORT||4000);
  const server=createApp().listen(port,'0.0.0.0',()=>console.log('Mileway listening on port',port));
  const shutdown=()=>{server.close(()=>{void mongoose.disconnect().then(()=>process.exit(0));});setTimeout(()=>process.exit(1),8000).unref();};
  process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);
}
main().catch((e:Error)=>{ console.error('Startup failed:',e.name,e.message.replace(/mongodb(?:\+srv)?:\/\/\S+/ig,'[database URI]'));process.exit(1); });
