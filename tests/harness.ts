import {randomBytes} from 'node:crypto';
import mongoose from 'mongoose';
import {MongoMemoryReplSet} from 'mongodb-memory-server-core';
import {createApp} from '../apps/api/src/app';
import {connectDatabase} from '../apps/api/src/config/database';
import {seed} from '../apps/api/src/seed';

export async function setupSuite() {
  const unique='mileway_test_'+randomBytes(10).toString('hex');
  const instance=process.env.TEST_MONGODB_URI ? undefined : await MongoMemoryReplSet.create({
    binary:{version:process.env.MONGOMS_VERSION || '7.0.32'},
    replSet:{count:1,storageEngine:'wiredTiger'},instanceOpts:[{args:['--wiredTigerCacheSizeGB','0.25']}]
  });
  const uri=new URL(process.env.TEST_MONGODB_URI || instance!.getUri());
  uri.pathname='/'+unique;
  Object.assign(process.env,{APP_ENV:'test',NODE_ENV:'test',DEMO_PAYMENTS:'true',ALLOW_DEV_RESET_LOG:'true',JWT_SECRET:randomBytes(48).toString('hex'),DEMO_SEED_PASSWORD:'Mw-'+randomBytes(12).toString('hex'),PUBLIC_BASE_URL:'http://localhost:4000', RAZORPAY_KEY_ID:'',RAZORPAY_KEY_SECRET:'',RAZORPAY_WEBHOOK_SECRET:'',SMTP_URL:'',RESEND_API_KEY:'',DEMO_SEED_EMAIL_DOMAIN:'mileway.test'});
  async function close(){
    try {if(mongoose.connection.name===unique) await mongoose.connection.dropDatabase();}
    finally {await mongoose.disconnect();await instance?.stop();}
  }
  try {
    await connectDatabase(uri.href);
    await seed();
    return {app:createApp(),close};
  } catch(err){await close();throw err;}
}
