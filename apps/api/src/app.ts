import express from 'express';
import path from 'node:path';
import {existsSync} from 'node:fs';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import {rateLimit} from 'express-rate-limit';
import mongoose from 'mongoose';
import swaggerUi from 'swagger-ui-express';
import {API_PREFIX} from '@mileway/shared';
import {HttpError} from './core';
import {handleErrors} from './middleware/errors';
import auth from './core/auth';
import catalog from './catalog';
import reservations from './reservations';
import management from './management';
import {webRoot,staticScriptHashes} from './config/static';
import {openapi} from './routes/openapi';

export function createApp() {
  const app=express();
  app.disable('x-powered-by');
  if(process.env.RENDER==='true') app.set('trust proxy',1);
  const trusted=new Set([process.env.PUBLIC_BASE_URL || 'http://localhost:4000',process.env.WEB_ORIGIN].filter(Boolean).map(v=>new URL(v!).origin));
  const scriptHashes=staticScriptHashes();
  app.use(helmet({contentSecurityPolicy:{directives:{
    'script-src':["'self'",...scriptHashes,'https://checkout.razorpay.com'],
    'connect-src':["'self'",'https://*.razorpay.com','https://*.razorpay.in'],
    'frame-src':["'self'",'https://*.razorpay.com','https://*.razorpay.in'],
    'img-src':["'self'",'data:','https://*.razorpay.com'],
    'upgrade-insecure-requests':process.env.NODE_ENV==='production'?[]:null
  }},crossOriginOpenerPolicy:{policy:'same-origin-allow-popups'}}));
  app.use(cors({origin(origin,cb){cb(null,!origin || trusted.has(origin));},credentials:true}));
  app.get('/api/health',(_req,res)=>{const ready=mongoose.connection.readyState===1;res.status(ready?200:503).json({status:ready?'ok':'unavailable',database:ready?'connected':'disconnected'});});
  app.use('/api',rateLimit({windowMs:60000,limit:process.env.APP_ENV==='test'?3000:240,standardHeaders:'draft-7',legacyHeaders:false,message:{error:{message:'Too many requests. Try again shortly.'}}}));
  app.use('/api',(req,res,next)=>{
    res.set('Cache-Control','no-store');
    if(!['GET','HEAD','OPTIONS'].includes(req.method) && req.originalUrl.split('?')[0]!=='/api/v1/payments/webhook') {
      // JSON-only writes force a CORS preflight. Reject foreign origins even if their client skips it.
      if(req.get('sec-fetch-site')==='cross-site' || (req.get('origin') && !trusted.has(req.get('origin')!))) return next(new HttpError(403,'Untrusted request origin.'));
      if(!req.is('application/json') && (Number(req.headers['content-length'])>0 || req.headers['transfer-encoding'] || req.get('origin') && !req.get('x-mileway-request'))) return next(new HttpError(415,'Send an application/json request.'));
    }
    next();
  });
  app.use(express.json({limit:'96kb',verify(req,_res,buf){if(req.url?.split('?')[0]==='/api/v1/payments/webhook') (req as express.Request).rawBody=buf;}}),cookieParser());
  app.get('/api/openapi.json',(_req,res)=>res.json(openapi));
  app.use('/api/docs',swaggerUi.serve,swaggerUi.setup(openapi,{customSiteTitle:'Mileway API'}));
  app.use(API_PREFIX,auth,catalog,reservations,management);
  app.use('/api',(_req,_res,next)=>next(new HttpError(404,'API endpoint not found.')));
  app.use('/_next/static',express.static(path.join(webRoot,'_next/static'),{immutable:true,maxAge:'1y'}));
  app.use(express.static(webRoot,{extensions:['html']}));
  app.get('*',(_req,res)=>{const file=path.join(webRoot,'404.html');if(existsSync(file))res.status(404).sendFile(file);else res.status(404).send('Page not found. Build the web workspace to serve the frontend.');});
  app.use(handleErrors);
  return app;
}
export default createApp;
