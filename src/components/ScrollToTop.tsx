import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/** Keeps client and admin pages at the top after navigation and failed saves. */
export function ScrollToTop() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname, search]);

  useEffect(() => {
    const scrollToError = () => window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    window.addEventListener('save:error', scrollToError);
    return () => window.removeEventListener('save:error', scrollToError);
  }, []);

  return null;
}