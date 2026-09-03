import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import './index.css';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

if (!GOOGLE_CLIENT_ID && import.meta.env.DEV) {
  console.warn(
    '[FitGen] VITE_GOOGLE_CLIENT_ID is not set — the sign-in button will show a setup notice. See client/.env.example',
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/*
      GoogleOAuthProvider needs a string client id. Passing an empty string keeps
      the app rendering when it is unset; the Login page detects this and shows
      configuration instructions instead of a broken button.
    */}
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID ?? ''}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </GoogleOAuthProvider>
  </StrictMode>,
);
