import { Logo } from './ui';

export const Footer = () => (
  <footer className="mt-auto border-t border-line">
    <div className="shell flex flex-col items-start gap-6 py-10 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <Logo />
        <p className="mt-3 max-w-sm text-sm text-fog-dim">
          Workout splits and macro diet plans built around your goals, equipment and
          injuries — grounded in a verified exercise and nutrition database.
        </p>
      </div>

      <div className="text-sm text-fog-dim sm:text-right">
        <p>
          Exercise data ·{' '}
          <a
            href="https://github.com/yuhonas/free-exercise-db"
            target="_blank"
            rel="noreferrer noopener"
            className="text-fog underline decoration-line-bright underline-offset-2 hover:text-volt"
          >
            free-exercise-db
          </a>
        </p>
        <p className="mt-1">
          Nutrition data · USDA FoodData Central &amp; IFCT
        </p>
      </div>
    </div>
  </footer>
);
