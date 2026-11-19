import type { ClientSession, Types } from 'mongoose';
import { Review, Trip, Operator } from './models';

/** The caller owns the write transaction for adding or moderating a review. */
export async function refreshRatings(operatorId: Types.ObjectId, session: ClientSession) {
  // Make conflicting transactions retry, including two scores that happen to round to the same tenth.
  await Operator.updateOne({ _id: operatorId }, { $inc: { __v: 1 } }, { session });
  const [summary] = await Review.aggregate([
    { $match: { operatorId, visible: true } }, { $group: { _id: null, average: { $avg: '$rating' } } }
  ]).session(session);
  const rating = Math.round((summary?.average ?? 0) * 10) / 10;
  await Operator.updateOne({ _id: operatorId }, { $set: { rating } }, { session });
  await Trip.updateMany({ operatorId, departureAt: { $gt: new Date() } }, { $set: { rating } }, { session });
}
