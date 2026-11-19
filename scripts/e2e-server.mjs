import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {localDatabase} from './local-mongo.mjs';
const db=await localDatabase();
const port=Number(process.env.E2E_PORT||4137);
const env={...process.env,APP_ENV:'test',NODE_ENV:'test',MONGODB_URI:db.getUri('mileway_e2e'),JWT_SECRET:randomBytes(48).toString('hex'),DEMO_SEED_PASSWORD:process.env.E2E_SEED_PASSWORD || 'Mw-'+randomBytes(14).toString('hex'),DEMO_SEED_EMAIL_DOMAIN:'mileway.test',PUBLIC_BASE_URL:'http://127.0.0.1:'+port,PORT:String(port),DEMO_PAYMENTS:'true',SEED_ON_START:'true',RAZORPAY_KEY_ID:'',RAZORPAY_KEY_SECRET:'',RAZORPAY_WEBHOOK_SECRET:''};
const child=spawn(process.execPath,['apps/api/dist/server.js'],{env,stdio:'inherit'});
for(const sig of ['SIGTERM','SIGINT'])process.once(sig,()=>child.kill('SIGTERM'));
child.once('exit',async(code)=>{await db.stop();process.exit(code||0);});
