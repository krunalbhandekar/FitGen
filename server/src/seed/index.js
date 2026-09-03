import { connectDB, disconnectDB } from '../config/db.js';
import { seedExercises } from './seedExercises.js';
import { seedFoods } from './seedFoods.js';

/**
 * Seed runner.
 *
 *   npm run seed                  # upsert both collections
 *   npm run seed -- --fresh       # wipe both collections first
 *   npm run seed -- --only=foods  # foods | exercises
 */
const parseArgs = () => {
  const args = process.argv.slice(2);
  const only = args.find((a) => a.startsWith('--only='))?.split('=')[1];
  return {
    fresh: args.includes('--fresh'),
    only: only === 'foods' || only === 'exercises' ? only : 'all',
  };
};

const run = async () => {
  const { fresh, only } = parseArgs();

  console.log(`[seed] starting (target=${only}, fresh=${fresh})`);
  await connectDB();

  if (only === 'all' || only === 'exercises') {
    await seedExercises({ fresh });
  }

  if (only === 'all' || only === 'foods') {
    await seedFoods({ fresh });
  }

  console.log('[seed] complete');
  await disconnectDB();
};

run().catch(async (err) => {
  console.error('[seed] failed:', err.message);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
