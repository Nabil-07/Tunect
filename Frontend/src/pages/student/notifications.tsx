// src/pages/student/notifications.tsx
import { useEffect, useState } from "react";
import api from "../../lib/apiClient";
import { Link } from "react-router-dom";

type Notification = {
  id: string;
  message: string;
  createdAt: string;
  bookingId?: string;
};

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get("/notifications/my");
        setItems(res.data || []);
      } catch (err) {
        console.error("Failed to load notifications", err);
      }
    }
    load();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">Notifications</h1>
      {items.length === 0 ? (
        <p className="text-gray-500">No notifications</p>
      ) : (
        <ul className="space-y-3">
          {items.map((n) => (
            <li
              key={n.id}
              className="border rounded-lg p-4 bg-white shadow-sm"
            >
              <p className="text-sm">{n.message}</p>
              <p className="text-xs text-gray-400 mt-1">
                {new Date(n.createdAt).toLocaleString()}
              </p>
              {n.bookingId && (
                <Link
                  to={`/student/my-bookings?focus=${n.bookingId}`}
                  className="text-blue-600 text-xs hover:underline"
                >
                  View Booking
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
