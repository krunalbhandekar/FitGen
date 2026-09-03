import mongoose from 'mongoose';
import { env } from './env.js';

export const connectDB = async () => {
  mongoose.set('strictQuery', true);

  const conn = await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 15000,
  });

  console.log(`[db] connected → ${conn.connection.host}/${conn.connection.name}`);

  mongoose.connection.on('disconnected', () => {
    console.warn('[db] disconnected');
  });

  mongoose.connection.on('error', (err) => {
    console.error('[db] error:', err.message);
  });

  return conn;
};

export const disconnectDB = () => mongoose.disconnect();
