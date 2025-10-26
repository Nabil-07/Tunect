// src/pages/tutor/sessions.tsx
import { useEffect, useState } from 'react';
import { getMySessions } from '../../services/sessionService';

type Session = {
  id: string;
  studentName?: string;
  subject?: string;
  startTime: string;
  endTime: string;
  status?: 'UPCOMING' | 'COMPLETED';
};

function toArray(maybe: any): Session[] {
  if (Array.isArray(maybe)) return maybe as Session[];
  if (maybe && Array.isArray(maybe.items)) return maybe.items as Session[];
  return [];
}

export default function MySessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const result = await getMySessions();
        setSessions(toArray(result));
      } catch (err) {
        console.error('Failed to load sessions', err);
        setSessions([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">📅 My Teaching Sessions</h2>

      {loading ? (
        <p>Loading sessions...</p>
      ) : sessions.length === 0 ? (
        <p className="text-gray-500">No sessions found.</p>
      ) : (
        <div className="space-y-4">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="p-4 border rounded-lg shadow-sm bg-white hover:shadow transition-all duration-200"
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-lg font-semibold">{s.subject ?? 'Session'}</p>
                  {s.studentName && (
                    <p className="text-sm text-gray-700">👤 Student: {s.studentName}</p>
                  )}
                  <p className="text-sm text-gray-600">
                    🕒 {new Date(s.startTime).toLocaleString()} —{' '}
                    {new Date(s.endTime).toLocaleTimeString()}
                  </p>
                </div>
                {s.status && (
                  <span
                    className={`text-xs font-bold px-2 py-1 rounded-full ${
                      s.status === 'UPCOMING'
                        ? 'bg-blue-100 text-blue-600'
                        : 'bg-green-100 text-green-600'
                    }`}
                  >
                    {s.status}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
