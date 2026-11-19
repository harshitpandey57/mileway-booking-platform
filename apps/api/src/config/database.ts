import mongoose from 'mongoose';
export async function connectDatabase(uri: string) {
  await mongoose.connect(uri, {maxPoolSize: 12, serverSelectionTimeoutMS: 15000});
  const topology = await mongoose.connection.db!.admin().command({hello: 1});
  if (!topology.setName && topology.msg !== 'isdbgrid') {
    await mongoose.disconnect();
    throw new Error('Seat holds require MongoDB Atlas or a replica set. For local use run npm run db:local.');
  }
  await Promise.all(Object.values(mongoose.models).map(model => model.init()));
}
