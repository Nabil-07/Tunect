// src/components/NotificationBell.tsx
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../lib/apiClient";
import { useAuth } from "../contexts/AuthContext";

type Notification = {
  id: string;
  message: string;
  createdAt: string;
  bookingId?: string;
  isRead?: boolean;
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const { user } = useAuth();

  const loadNotifications = async () => {
    try {
      const res = await api.get("/notifications/my");
      setItems(res.data || []);
    } catch (err) {
      console.error("Failed to load notifications", err);
    }
  };

  useEffect(() => {
    loadNotifications();

    // Listen for notification updates from the notifications page
    const handleUpdate = () => {
      loadNotifications();
    };

    window.addEventListener('notifications:updated', handleUpdate);

    return () => {
      window.removeEventListener('notifications:updated', handleUpdate);
    };
  }, []);

  const unreadCount = items.filter(n => !n.isRead).length;

  return (
    <div className="relative">
      <button
        className="relative p-2"
        onClick={() => setOpen((prev) => !prev)}
      >
        <Bell className="w-6 h-6" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full px-1">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-white shadow-lg rounded-lg border z-50">
          {items.length === 0 ? (
            <p className="p-3 text-sm text-gray-500">No notifications</p>
          ) : (
            <ul>
              {items.slice(0, 5).map((n) => (
                <li
                  key={n.id}
                  className="p-3 border-b text-sm hover:bg-gray-50"
                >
                  {n.bookingId ? (
                    <Link to={`/student/my-bookings?focus=${n.bookingId}`}>
                      {n.message}
                    </Link>
                  ) : (
                    n.message
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="p-2 text-center">
            <Link
              to={user?.role === 'TUTOR' ? "/tutor/notifications" : "/student/notifications"}
              className="text-blue-600 text-sm hover:underline"
            >
              View all
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
