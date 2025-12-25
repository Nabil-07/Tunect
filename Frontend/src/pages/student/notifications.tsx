// src/pages/student/notifications.tsx
import { useEffect, useState } from "react";
import api from "../../lib/apiClient";
import { Link } from "react-router-dom";
import { Bell, BellOff, Check, CheckCheck } from "lucide-react";

type Notification = {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
  bookingId?: string;
  booking?: {
    id: string;
    startTime: string;
    endTime: string;
    tutor?: {
      id: string;
      user?: {
        name: string;
      };
    };
  };
};

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const params = filter === 'unread' ? '?unreadOnly=true' : '';
      const res = await api.get(`/notifications/my${params}`);
      setItems(res.data || []);
      
      // Get unread count
      const countRes = await api.get('/notifications/my/unread-count');
      setUnreadCount(countRes.data?.count || 0);
    } catch (err) {
      console.error("Failed to load notifications", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, [filter]);

  const markAsRead = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setItems(items.map(item => 
        item.id === id ? { ...item, isRead: true } : item
      ));
      setUnreadCount(Math.max(0, unreadCount - 1));
    } catch (err) {
      console.error("Failed to mark as read", err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.patch('/notifications/mark-all-read');
      setItems(items.map(item => ({ ...item, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error("Failed to mark all as read", err);
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'BOOKING': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'MESSAGE': return 'bg-green-50 text-green-700 border-green-200';
      case 'PAYMENT': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'REMINDER': return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      default: return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Bell className="h-6 w-6" />
              Notifications
            </h1>
            {unreadCount > 0 && (
              <p className="text-sm text-slate-600 mt-1">
                {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100"
            >
              <CheckCheck className="h-4 w-4" />
              Mark all as read
            </button>
          )}
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              filter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              filter === 'unread'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            Unread
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-slate-600 mt-4">Loading notifications...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <BellOff className="h-16 w-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600 text-lg">
              {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            </p>
            <p className="text-slate-500 text-sm mt-2">
              We'll notify you when something important happens
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((n) => (
              <div
                key={n.id}
                className={`bg-white rounded-xl shadow-sm p-5 border transition hover:shadow-md ${
                  n.isRead ? 'border-slate-200' : 'border-blue-300 bg-blue-50/30'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getTypeColor(n.type)}`}>
                        {n.type}
                      </span>
                      {!n.isRead && (
                        <span className="flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-blue-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                        </span>
                      )}
                    </div>
                    
                    <h3 className="font-semibold text-slate-900 mb-1">{n.title}</h3>
                    <p className="text-sm text-slate-700 mb-2">{n.message}</p>
                    
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span>{new Date(n.createdAt).toLocaleString()}</span>
                      {n.booking && (
                        <span>
                          with {n.booking.tutor?.user?.name || 'Tutor'}
                        </span>
                      )}
                    </div>

                    {n.bookingId && (
                      <Link
                        to={`/student/bookings?focus=${n.bookingId}`}
                        className="inline-flex items-center text-sm text-blue-600 hover:text-blue-700 font-medium mt-3"
                      >
                        View Booking →
                      </Link>
                    )}
                  </div>

                  {!n.isRead && (
                    <button
                      onClick={() => markAsRead(n.id)}
                      className="flex-shrink-0 p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                      title="Mark as read"
                    >
                      <Check className="h-5 w-5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
