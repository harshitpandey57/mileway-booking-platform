import { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import type { Role } from '@mileway/shared';
import { User } from './models';

declare global {
  namespace Express {
    interface Request { user?: {id: string; role: Role}; rawBody?: Buffer; }
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const asyncRoute = (handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { Promise.resolve(handler(req, res, next)).catch(next); };

export const requireUser = asyncRoute(async (req,res,next) => {
  const token = req.cookies?.mileway_session;
  if (typeof token !== 'string') throw new HttpError(401,'Sign in to continue.');
  let claims: jwt.JwtPayload | string;
  try { claims = jwt.verify(token,process.env.JWT_SECRET!,{algorithms:['HS256']}); }
  catch { throw new HttpError(401,'Your session has expired. Please sign in.'); }
  if (typeof claims === 'string' || !mongoose.isObjectIdOrHexString(claims.sub)) throw new HttpError(401,'Invalid session.');
  const user = await User.findById(claims.sub).select('role active tokenVersion');
  if (!user || !user.active || (claims.ver ?? 0) !== user.tokenVersion) throw new HttpError(401,'Your session has ended.');
  req.user = {id:String(user._id),role:user.role as Role};
  next();
});

export const roles = (...allowed: Role[]): RequestHandler => (req,_res,next) => {
  if (!req.user) return next(new HttpError(401,'Sign in to continue.'));
  if (!allowed.includes(req.user.role)) return next(new HttpError(403,'You do not have access to this resource.'));
  next();
};
