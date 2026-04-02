import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { stravaApi } from '@/lib/api';

export default function StravaCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('Connecting to Strava...');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');

    if (error || !code) {
      setStatus('Connection cancelled.');
      setTimeout(() => navigate('/training?strava=error'), 1500);
      return;
    }

    stravaApi.exchange(code)
      .then(() => {
        setStatus('Connected! Taking you back...');
        navigate('/training?strava=connected');
      })
      .catch(() => {
        setStatus('Connection failed. Redirecting...');
        setTimeout(() => navigate('/training?strava=error'), 2000);
      });
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-muted-foreground">{status}</p>
    </div>
  );
}
