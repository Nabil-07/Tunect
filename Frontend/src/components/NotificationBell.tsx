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

  const markAsRead = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setItems(prev => prev.map(item =>
        item.id === id ? { ...item, isRead: true } : item
      ));
      // Notify other components (e.g. notifications page) to update
      globalThis.dispatchEvent(new Event('notifications:updated'));
    } catch (err) {
      console.error("Failed to mark notification as read", err);
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) {
      markAsRead(notification.id);
    }
  };

  useEffect(() => {
    loadNotifications();

    // Listen for notification updates from the notifications page
    const handleUpdate = () => {
      loadNotifications();
    };

    globalThis.addEventListener('notifications:updated', handleUpdate);

    // Poll for new notifications every 30 seconds
    const interval = setInterval(loadNotifications, 30000);

    return () => {
      globalThis.removeEventListener('notifications:updated', handleUpdate);
      clearInterval(interval);
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
                  className={`p-3 border-b text-sm hover:bg-gray-50 cursor-pointer ${
                    n.isRead ? '' : 'bg-blue-50 font-medium'
                  }`}
                >
                  {n.bookingId ? (
                    <Link
                      to={`/student/bookings?focus=${n.bookingId}`}
                      onClick={() => { handleNotificationClick(n); setOpen(false); }}
                      className="block"
                    >
                      {n.message}
                      {!n.isRead && (
                        <span className="inline-block ml-2 w-2 h-2 bg-blue-500 rounded-full" />
                      )}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => handleNotificationClick(n)}
                    >
                      {n.message}
                      {!n.isRead && (
                        <span className="inline-block ml-2 w-2 h-2 bg-blue-500 rounded-full" />
                      )}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="p-2 text-center">
            <Link
              to={user?.role === 'TUTOR' ? "/tutor/notifications" : "/student/notifications"}
              className="text-blue-600 text-sm hover:underline"
              onClick={() => setOpen(false)}
            >
              View all
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
