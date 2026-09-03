import { Link } from 'react-router-dom';
import { Button } from '../components/ui';

export const NotFound = () => (
  <div className="shell grid min-h-[70vh] place-items-center py-16 text-center">
    <div>
      <p className="display-xl text-line-bright">404</p>
      <h1 className="display-md mt-2">This set doesn&apos;t exist</h1>
      <p className="mx-auto mt-3 max-w-sm text-sm text-fog">
        The page you were looking for isn&apos;t here. Let&apos;s get you back to
        something useful.
      </p>
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <Button as={Link} to="/">
          Back to home
        </Button>
        <Button as={Link} to="/exercises" variant="outline">
          Exercise library
        </Button>
      </div>
    </div>
  </div>
);
