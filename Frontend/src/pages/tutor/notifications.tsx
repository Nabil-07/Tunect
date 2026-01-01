// src/pages/tutor/notifications.tsx
import { useEffect, useState } from "react";
import { Bell, Check, Trash2 } from "lucide-react";
import api from "../../lib/apiClient";
import { Link } from "react-router-dom";

type Notification = {
  id: string;
  message: string;
  createdAt: string;
  bookingId?: string;
  isRead?: boolean;
};

export default function TutorNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotifications();
  }, []);

  async function loadNotifications() {
    try {
      setLoading(true);
      const res = await api.get("/notifications/my");
      setNotifications(res.data || []);
    } catch (err) {
      console.error("Failed to load notifications", err);
    } finally {
      setLoading(false);
    }
  }

  async function markAsRead(id: string) {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      // Reload to update count
      await loadNotifications();
      // Notify NotificationBell to update
      window.dispatchEvent(new Event('notifications:updated'));
    } catch (err) {
      console.error("Failed to mark as read", err);
    }
  }

  async function deleteNotification(id: string) {
    try {
      await api.delete(`/notifications/${id}`);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      // Reload to update count
      await loadNotifications();
      // Notify NotificationBell to update
      window.dispatchEvent(new Event('notifications:updated'));
    } catch (err) {
      console.error("Failed to delete notification", err);
    }
  }

  async function markAllAsRead() {
    try {
      await api.post("/notifications/mark-all-read");
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      // Reload to update count
      await loadNotifications();
      // Notify NotificationBell to update
      window.dispatchEvent(new Event('notifications:updated'));
    } catch (err) {
      console.error("Failed to mark all as read", err);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-1/4"></div>
          <div className="h-20 bg-slate-100 rounded"></div>
          <div className="h-20 bg-slate-100 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Bell className="h-7 w-7 text-indigo-600" />
          <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
        </div>
        {notifications.length > 0 && (
          <button
            onClick={markAllAsRead}
            className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Mark all as read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="text-center py-12">
          <Bell className="h-16 w-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-600">No notifications</h3>
          <p className="text-slate-500 mt-2">You're all caught up!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={`rounded-lg border p-4 transition ${
                notification.isRead
                  ? "bg-white border-slate-200"
                  : "bg-indigo-50 border-indigo-200"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  {notification.bookingId ? (
                    <Link
                      to={`/tutor/sessions?focus=${notification.bookingId}`}
                      className="text-slate-900 hover:text-indigo-600"
                      onClick={() => !notification.isRead && markAsRead(notification.id)}
                    >
                      <p className="text-sm leading-relaxed">
                        {notification.message}
                      </p>
                    </Link>
                  ) : (
                    <p className="text-sm text-slate-900 leading-relaxed">
                      {notification.message}
                    </p>
                  )}
                  <p className="text-xs text-slate-500 mt-1">
                    {new Date(notification.createdAt).toLocaleString()}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {!notification.isRead && (
                    <button
                      onClick={() => markAsRead(notification.id)}
                      className="p-1.5 rounded-lg hover:bg-emerald-100 text-emerald-600 transition"
                      title="Mark as read"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => deleteNotification(notification.id)}
                    className="p-1.5 rounded-lg hover:bg-red-100 text-red-600 transition"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
