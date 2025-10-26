// src/components/RescheduleModal.tsx
import { useState, useEffect } from "react";
import api from "../lib/apiClient";

type Props = {
  bookingId: string;
  tutorId: string;
  onClose: () => void;
  onRescheduled: () => void;
};

export default function RescheduleModal({ bookingId, tutorId, onClose, onRescheduled }: Props) {
  const [slots, setSlots] = useState<{ id: string; startTime: string; endTime: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get(`/tutors/${tutorId}/availability`);
        setSlots(res.data || []);
      } catch (err) {
        console.error("Failed to load slots", err);
      }
    }
    load();
  }, [tutorId]);

  async function reschedule(slotId: string) {
    setLoading(true);
    try {
      const slot = slots.find((s) => s.id === slotId);
      if (!slot) return;
      if (!window.confirm("You can only reschedule once. Are you sure?")) return;
      await api.patch(`/bookings/${bookingId}/reschedule`, {
        startTime: slot.startTime,
        endTime: slot.endTime,
      });
      onRescheduled();
      onClose();
    } catch (err) {
      console.error("Failed to reschedule", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
      <div className="bg-white rounded-lg shadow-lg w-96 p-6">
        <h2 className="text-lg font-semibold mb-4">Reschedule Booking</h2>
        {slots.length === 0 ? (
          <p className="text-gray-500">No available slots</p>
        ) : (
          <ul className="space-y-2 max-h-60 overflow-y-auto">
            {slots.map((s) => (
              <li
                key={s.id}
                className="flex justify-between items-center border p-2 rounded"
              >
                <div>
                  <p className="text-sm font-medium">
                    {new Date(s.startTime).toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500">
                    to {new Date(s.endTime).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => reschedule(s.id)}
                  disabled={loading}
                  className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  Reschedule
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 text-right">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
