import type {ErrorRequestHandler} from 'express';
import {ZodError} from 'zod';
import mongoose from 'mongoose';
import {HttpError} from '../core';
export const handleErrors: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) return next(err);
  let status=500, message='The request could not be completed.';
  if (err instanceof HttpError) {status=err.status;message=err.message;}
  else if (err instanceof ZodError) {status=400;message=err.issues.map(i=>[i.path.join('.'),i.message].filter(Boolean).join(' — ')).join('. ');}
  else if (err instanceof mongoose.Error.ValidationError || err instanceof mongoose.Error.CastError) {status=400;message='Invalid record or field value.';}
  else if (err?.code===11000) {status=409;message='This record already exists or has just changed.';}
  else if (err?.status===400 || err?.status===413) {status=err.status;message=status===400?'Malformed request.':'Request is too large.';}
  else console.error('Unhandled request error', err?.name || 'Error');
  res.status(status).json({error:{message}, message});
};
