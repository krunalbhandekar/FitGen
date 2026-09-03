import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Dumbbell, ExternalLink } from 'lucide-react';
import { api } from '../lib/api';
import { Badge, Button, ErrorState, Spinner } from '../components/ui';

const titleCase = (value = '') =>
  value.replace(/\b\w/g, (char) => char.toUpperCase());

const Meta = ({ label, value }) =>
  value ? (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1 font-semibold">{titleCase(value)}</dd>
    </div>
  ) : null;

export const ExerciseDetail = () => {
  const { slug } = useParams();
  const [exercise, setExercise] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeImage, setActiveImage] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/exercises/${encodeURIComponent(slug)}`);
      setExercise(data.data);
      setActiveImage(0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <Spinner label="Loading exercise" className="min-h-[60vh]" />;

  if (error) {
    return (
      <div className="shell py-12">
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }

  const images = exercise.images ?? [];

  return (
    <div className="shell py-8 sm:py-12">
      <Link
        to="/exercises"
        className="inline-flex items-center gap-1.5 text-sm text-fog-dim transition-colors hover:text-chalk"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Back to library
      </Link>

      <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-12">
        {/* Demo images */}
        <div>
          <div className="panel aspect-4/3 overflow-hidden bg-panel-2">
            {images.length > 0 ? (
              <img
                key={images[activeImage]}
                src={images[activeImage]}
                alt={`${exercise.name} — position ${activeImage + 1}`}
                className="size-full object-cover"
              />
            ) : (
              <div className="grid size-full place-items-center" aria-hidden="true">
                <Dumbbell size={40} className="text-line-bright" />
              </div>
            )}
          </div>

          {images.length > 1 && (
            <div className="mt-3 flex gap-2" role="tablist" aria-label="Positions">
              {images.map((image, index) => (
                <button
                  key={image}
                  type="button"
                  role="tab"
                  aria-selected={index === activeImage}
                  aria-label={`Position ${index + 1}`}
                  onClick={() => setActiveImage(index)}
                  className={`h-16 w-20 overflow-hidden rounded-lg border-2 transition-colors ${
                    index === activeImage
                      ? 'border-volt'
                      : 'border-line hover:border-line-bright'
                  }`}
                >
                  <img
                    src={image}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detail */}
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            {exercise.level && <Badge tone="volt">{exercise.level}</Badge>}
            {exercise.category && <Badge>{exercise.category}</Badge>}
            {exercise.mechanic && <Badge>{exercise.mechanic}</Badge>}
          </div>

          <h1 className="display-lg mt-4 text-balance">{exercise.name}</h1>

          <dl className="mt-7 grid grid-cols-2 gap-5 border-y border-line py-5 sm:grid-cols-3">
            <Meta label="Equipment" value={exercise.equipment} />
            <Meta label="Force" value={exercise.force} />
            <Meta label="Primary" value={exercise.primaryMuscles?.join(', ')} />
          </dl>

          {exercise.secondaryMuscles?.length > 0 && (
            <div className="mt-5">
              <p className="eyebrow mb-2">Also works</p>
              <div className="flex flex-wrap gap-1.5">
                {exercise.secondaryMuscles.map((muscle) => (
                  <Badge key={muscle}>{muscle}</Badge>
                ))}
              </div>
            </div>
          )}

          {exercise.demoUrl && (
            <Button
              as="a"
              href={exercise.demoUrl}
              target="_blank"
              rel="noreferrer noopener"
              variant="outline"
              className="mt-6"
            >
              Watch form demos
              <ExternalLink size={15} aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>

      {exercise.instructions?.length > 0 && (
        <section className="mt-12" aria-labelledby="how-to">
          <h2 id="how-to" className="display-md border-b border-line pb-4">
            How to perform
          </h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-2">
            {exercise.instructions.map((instruction, index) => (
              <li key={instruction} className="panel flex gap-4 p-5">
                <span
                  className="font-display text-2xl leading-none text-volt"
                  aria-hidden="true"
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                <p className="text-sm leading-relaxed text-fog">{instruction}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
};
