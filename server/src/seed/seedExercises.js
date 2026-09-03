import { Exercise } from '../models/Exercise.js';

const DATASET_URL =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
const IMAGE_BASE =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';

const ALLOWED_FORCE = new Set(['push', 'pull', 'static']);
const ALLOWED_MECHANIC = new Set(['compound', 'isolation']);
const ALLOWED_LEVEL = new Set(['beginner', 'intermediate', 'expert']);

const normaliseList = (list) =>
  Array.isArray(list)
    ? list.map((v) => String(v).trim().toLowerCase()).filter(Boolean)
    : [];

/** Maps an upstream record onto our Exercise schema. */
const toExercise = (raw) => {
  const slug = raw.id ?? raw.name?.replace(/\s+/g, '_');

  return {
    slug,
    name: raw.name,
    force: ALLOWED_FORCE.has(raw.force) ? raw.force : null,
    level: ALLOWED_LEVEL.has(raw.level) ? raw.level : undefined,
    mechanic: ALLOWED_MECHANIC.has(raw.mechanic) ? raw.mechanic : null,
    equipment: raw.equipment ? String(raw.equipment).toLowerCase() : undefined,
    category: raw.category ? String(raw.category).toLowerCase() : undefined,
    primaryMuscles: normaliseList(raw.primaryMuscles),
    secondaryMuscles: normaliseList(raw.secondaryMuscles),
    instructions: Array.isArray(raw.instructions) ? raw.instructions : [],
    images: (raw.images ?? []).map((path) => `${IMAGE_BASE}/${path}`),
    // Upstream ships step images, not hosted video; this gives the UI a
    // reliable demo link without inventing one.
    demoUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(
      `${raw.name} exercise form`,
    )}`,
    source: 'free-exercise-db',
  };
};

export const seedExercises = async ({ fresh = false } = {}) => {
  console.log('[seed:exercises] downloading dataset…');

  const response = await fetch(DATASET_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to download exercise dataset (HTTP ${response.status}). Check your connection.`,
    );
  }

  const raw = await response.json();
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('Exercise dataset was empty or malformed');
  }

  console.log(`[seed:exercises] received ${raw.length} records`);

  if (fresh) {
    const { deletedCount } = await Exercise.deleteMany({});
    console.log(`[seed:exercises] cleared ${deletedCount} existing documents`);
  }

  const seen = new Set();
  const operations = [];
  let skipped = 0;

  for (const record of raw) {
    const doc = toExercise(record);

    if (!doc.slug || !doc.name || seen.has(doc.slug)) {
      skipped += 1;
      continue;
    }
    seen.add(doc.slug);

    operations.push({
      updateOne: {
        filter: { slug: doc.slug },
        update: { $set: doc },
        upsert: true,
      },
    });
  }

  // Upsert in batches so a large dataset doesn't build one huge request.
  const BATCH = 250;
  let inserted = 0;
  let updated = 0;

  for (let i = 0; i < operations.length; i += BATCH) {
    const result = await Exercise.bulkWrite(operations.slice(i, i + BATCH), {
      ordered: false,
    });
    inserted += result.upsertedCount ?? 0;
    updated += result.modifiedCount ?? 0;
  }

  const total = await Exercise.countDocuments();
  console.log(
    `[seed:exercises] done — ${inserted} inserted, ${updated} updated, ${skipped} skipped, ${total} total`,
  );

  return { inserted, updated, skipped, total };
};
