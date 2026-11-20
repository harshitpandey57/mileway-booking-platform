import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {localDatabase} from './local-mongo.mjs';

// Reuse mail settings from the project .env while keeping demo accounts and inventory local.
const projectEnv = existsSync('.env') ? parseEnv(readFileSync('.env', 'utf8')) : {};
const mailSettings = {};
for (const key of ['RESEND_API_KEY', 'SMTP_URL', 'MAIL_FROM']) {
  if (projectEnv[key] !== undefined) mailSettings[key] = projectEnv[key];
}
const localDir='.local';
mkdirSync(localDir,{recursive:true,mode:0o700});
const credentialFile=localDir+'/demo.env';
if(!existsSync(credentialFile)) writeFileSync(credentialFile,
  'JWT_SECRET='+randomBytes(48).toString('hex')+'\nDEMO_SEED_PASSWORD=Mw-'+randomBytes(16).toString('hex')+'\n',{mode:0o600,flag:'wx'});
const port=Number(process.env.PORT||4000);
const db=await localDatabase({persistent:true});
const env={...mailSettings,...process.env,...parseEnv(readFileSync(credentialFile,'utf8')),MONGODB_URI:db.getUri('mileway'),APP_ENV:'demo',NODE_ENV:'development',PUBLIC_BASE_URL:'http://localhost:'+port,PORT:String(port),DEMO_PAYMENTS:'true',SEED_ON_START:'true',ALLOW_DEV_RESET_LOG:'true',RAZORPAY_KEY_ID:'',RAZORPAY_KEY_SECRET:'',RAZORPAY_WEBHOOK_SECRET:''};
function runBuild() {
  const options = {stdio: 'inherit', env: {...env, NODE_ENV: 'production'}};
  const npmCli = process.env.npm_execpath;
  // npm supplies its JS entry point, including when PowerShell launches npm.cmd.
  const build = npmCli
    ? spawn(process.execPath, [npmCli, 'run', 'build'], options)
    : spawn('npm run build', {...options, shell: true});
  return new Promise((resolve, reject) => {
    build.once('error', reject);
    build.once('exit', code => code === 0 ? resolve() : reject(new Error('Build exited with code ' + code)));
  });
}
let server;
let stopping=false;
async function stop(){if(stopping)return;stopping=true;server?.kill('SIGTERM');await db.stop({doCleanup:false,force:false});}
for(const s of ['SIGINT','SIGTERM'])process.once(s,()=>{void stop();});
try {
  await runBuild();
  console.log('Demo sign-in: customer@mileway.test, operator1@mileway.test or admin@mileway.test. Read the generated password in .local/demo.env.');
  server=spawn(process.execPath,['apps/api/dist/server.js'],{stdio:'inherit',env});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.once('exit',code=>code && !stopping?reject(new Error('Server exited '+code)):resolve());});
} finally {await stop();}
