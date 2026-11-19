import {MongoMemoryReplSet} from 'mongodb-memory-server-core';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export async function localDatabase({persistent=false, port}={}) {
  const instance={ip:'127.0.0.1',args:['--wiredTigerCacheSizeGB','0.25']};
  if (persistent) {
    const dbPath=path.resolve('.local/mongo');
    mkdirSync(dbPath,{recursive:true,mode:0o700});
    Object.assign(instance,{dbPath,port:port || 27017});
  }
  return MongoMemoryReplSet.create({binary:{version:process.env.MONGOMS_VERSION || '7.0.32'},instanceOpts:[instance],replSet:{count:1,name:'rs0',storageEngine:'wiredTiger',ip:'127.0.0.1'}});
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const db=await localDatabase({persistent:true});
  console.log('Local replica set ready:',db.getUri('mileway'));
  for(const signal of ['SIGINT','SIGTERM']) process.once(signal,async()=>{await db.stop({doCleanup:false,force:false});process.exit(0);});
}
