import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Bot,
  Calculator,
  Database,
  Dumbbell,
  HeartPulse,
  Salad,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Badge, Button } from '../components/ui';

const FEATURES = [
  {
    icon: Dumbbell,
    title: 'Splits that fit your rack',
    body: 'PPL, upper–lower, bro split or full body — built only from equipment you actually have, and routed around your injury history.',
  },
  {
    icon: Salad,
    title: 'Macros, not vibes',
    body: 'BMR and TDEE from the Mifflin–St Jeor formula, split into protein, carbs and fats, then filled with real foods and real portions.',
  },
  {
    icon: Database,
    title: 'Grounded in verified data',
    body: '876 catalogued exercises and a curated nutrition database. The AI selects from this library — it never invents a lift or a macro value.',
  },
  {
    icon: TrendingUp,
    title: 'Progressive overload, automated',
    body: 'Log what you actually lifted. Your next session adjusts load and volume, and deloads when the numbers say you need one.',
  },
  {
    icon: Bot,
    title: 'A coach that answers',
    body: 'Ask about supplement timing, form cues or recovery. Answers are retrieved from a curated knowledge base, not improvised.',
  },
  {
    icon: HeartPulse,
    title: 'Adapts as you do',
    body: 'Change a goal, an injury or your gym, and your plan regenerates. Every version is kept so you can see what changed.',
  },
];

const STATS = [
  { value: '876', label: 'Verified exercises' },
  { value: '129', label: 'Foods with macros' },
  { value: '4', label: 'Training splits' },
  { value: '0', label: 'Hallucinated lifts' },
];

const STEPS = [
  {
    step: '01',
    title: 'Sign in with Google',
    body: 'No password to invent or forget. Google verifies who you are; we never see credentials.',
  },
  {
    step: '02',
    title: 'Tell us your situation',
    body: 'Body stats, goal, training days, the equipment you can reach, how you eat, and anything that hurts.',
  },
  {
    step: '03',
    title: 'Train the plan',
    body: 'Get your split and your macro-matched meals. Log sessions, and the plan keeps up with you.',
  },
];

export const Landing = () => {
  const { isAuthenticated } = useAuth();
  const primaryTo = isAuthenticated ? '/dashboard' : '/login';
  const primaryLabel = isAuthenticated ? 'Open dashboard' : 'Start free';

  return (
    <div>
      {/* ------------------------------------------------------------- Hero */}
      <section className="relative overflow-hidden border-b border-line">
        <div
          className="grid-lines pointer-events-none absolute inset-0 opacity-25"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -top-40 -right-32 size-[34rem] rounded-full bg-volt/8 blur-3xl"
          aria-hidden="true"
        />

        <div className="shell relative py-16 sm:py-24 lg:py-32">
          <div className="max-w-4xl">
            <Badge tone="volt">
              <ShieldCheck size={12} aria-hidden="true" />
              AI grounded in a verified database
            </Badge>

            <h1 className="display-xl mt-5">
              Stop training
              <br />
              <span className="text-volt">someone else&apos;s</span>
              <br />
              programme.
            </h1>

            <p className="mt-6 max-w-xl text-base text-fog sm:text-lg">
              FitGen builds your workout split and macro diet plan around the body you
              have, the equipment you can reach and the joints you have to protect —
              then rebuilds them as things change.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button as={Link} to={primaryTo} size="lg" className="w-full sm:w-auto">
                {primaryLabel}
                <ArrowRight size={18} aria-hidden="true" />
              </Button>
              <Button
                as="a"
                href="#how"
                variant="outline"
                size="lg"
                className="w-full sm:w-auto"
              >
                See how it works
              </Button>
            </div>

            <p className="mt-4 text-xs text-fog-dim">
              Google sign-in only · No card required
            </p>
          </div>

          {/* Stat strip */}
          <dl className="mt-14 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:mt-20 lg:grid-cols-4">
            {STATS.map(({ value, label }) => (
              /* column-reverse puts the number above its label while keeping
                 the required dt-before-dd source order. */
              <div key={label} className="flex flex-col-reverse bg-ink p-5 sm:p-6">
                <dt className="eyebrow mt-1">{label}</dt>
                <dd className="display-md text-volt tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* --------------------------------------------------------- Features */}
      <section className="shell py-16 sm:py-24">
        <div className="max-w-2xl">
          <p className="eyebrow">What you get</p>
          <h2 className="display-lg mt-3 text-balance">
            Built like a coach thinks, not like a template
          </h2>
        </div>

        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <li
              key={title}
              className="panel group p-6 transition-colors hover:border-line-bright"
            >
              <span className="grid size-11 place-items-center rounded-xl bg-volt/10 text-volt transition-colors group-hover:bg-volt group-hover:text-ink">
                <Icon size={20} aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-lg font-bold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fog">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* -------------------------------------------------------------- How */}
      <section id="how" className="border-y border-line bg-panel/40">
        <div className="shell py-16 sm:py-24">
          <div className="max-w-2xl">
            <p className="eyebrow">How it works</p>
            <h2 className="display-lg mt-3">Three steps to a real plan</h2>
          </div>

          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {STEPS.map(({ step, title, body }) => (
              <li key={step} className="panel relative overflow-hidden p-6">
                <div
                  className="stripes absolute inset-x-0 top-0 h-1.5"
                  aria-hidden="true"
                />
                <span className="font-display text-4xl text-line-bright">{step}</span>
                <h3 className="mt-3 text-lg font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-fog">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------- Science / trust */}
      <section className="shell py-16 sm:py-24">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="eyebrow">The method</p>
            <h2 className="display-lg mt-3 text-balance">
              Maths where maths belongs. AI where judgement belongs.
            </h2>
            <p className="mt-5 text-sm leading-relaxed text-fog sm:text-base">
              Most &ldquo;AI fitness&rdquo; tools hand the whole problem to a language
              model and hope. FitGen splits the work by what each part is actually good
              at, which is why its numbers reconcile and its exercises exist.
            </p>
            <Button as={Link} to={primaryTo} className="mt-8">
              {primaryLabel}
              <ArrowRight size={16} aria-hidden="true" />
            </Button>
          </div>

          <ul className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line">
            {[
              {
                icon: Calculator,
                label: 'Deterministic formulas',
                body: 'BMR, TDEE, macro split and body-fat estimate are computed, never guessed — same inputs, same answer, every time.',
              },
              {
                icon: Database,
                label: 'Verified database',
                body: 'Exercise names, muscle groups, demos and nutrition values are pre-seeded from published datasets.',
              },
              {
                icon: Activity,
                label: 'AI for personalisation',
                body: 'The model decides which exercises pair, how to sequence them and how meals compose — constrained to the library.',
              },
            ].map(({ icon: Icon, label, body }) => (
              <li key={label} className="flex gap-4 bg-ink p-5 sm:p-6">
                <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-volt/10 text-volt">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <div>
                  <h3 className="font-bold">{label}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-fog">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* --------------------------------------------------------------- CTA */}
      <section className="shell pb-16 sm:pb-24">
        <div className="panel relative overflow-hidden px-6 py-14 text-center sm:px-12 sm:py-20">
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-volt/8 via-transparent to-ember/8"
            aria-hidden="true"
          />
          <div className="relative">
            <h2 className="display-lg text-balance">
              Your gym. Your body. Your plan.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-sm text-fog sm:text-base">
              Sign in with Google and have a full split and macro plan in minutes.
            </p>
            <Button as={Link} to={primaryTo} size="lg" className="mt-8">
              {primaryLabel}
              <ArrowRight size={18} aria-hidden="true" />
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
};
