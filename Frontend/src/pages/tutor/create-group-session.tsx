import { useState } from "react";
import { Users, Calendar, IndianRupee, Clock, Video } from "lucide-react";
import {
  createGroupSession,
  type CreateGroupSessionPayload,
} from "../../services/bookingsService";
import { useToast } from "../../contexts/ToastContext";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

export default function CreateGroupSession() {
  const { showSuccess, showError } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const tutorId = user?.tutor?.id || "";

  const [loading, setLoading] = useState(false);
  const [startTimeLocal, setStartTimeLocal] = useState("");
  const [endTimeLocal, setEndTimeLocal] = useState("");
  const [formData, setFormData] = useState<Partial<CreateGroupSessionPayload>>({
    tutorId,
    maxStudents: 5,
    pricePerStudent: 50,
    isDemo: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!startTimeLocal || !endTimeLocal || !formData.subject || !formData.maxStudents || !formData.pricePerStudent) {
      showError("Please fill in all required fields");
      return;
    }

    if (formData.maxStudents < 2 || formData.maxStudents > 10) {
      showError("Group size must be between 2 and 10 students");
      return;
    }

    try {
      setLoading(true);
      // Convert local datetime to ISO only when submitting
      const payload = {
        ...formData,
        startTime: new Date(startTimeLocal).toISOString(),
        endTime: new Date(endTimeLocal).toISOString(),
      };
      await createGroupSession(payload as CreateGroupSessionPayload);
      showSuccess("Group session created successfully!");
      setTimeout(() => navigate("/tutor/sessions"), 1500);
    } catch (err: any) {
      showError(err?.response?.data?.message || "Failed to create group session");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : type === "number" ? parseFloat(value) : value,
    }));
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">Create Group Session</h1>
        <p className="text-slate-600">
          Set up a group learning session for multiple students
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-lg p-6 space-y-6">
        {/* Subject */}
        <div>
          <label htmlFor="subject" className="block text-sm font-medium text-slate-700 mb-2">
            Subject / Topic <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="subject"
            name="subject"
            value={formData.subject || ""}
            onChange={handleChange}
            placeholder="e.g., Advanced Calculus, Physics Mechanics"
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            required
          />
        </div>

        {/* Date and Time */}
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="startTime" className="block text-sm font-medium text-slate-700 mb-2">
              <Calendar className="inline h-4 w-4 mr-1" />
              Start Date & Time <span className="text-red-500">*</span>
            </label>
            <input
              type="datetime-local"
              id="startTime"
              name="startTime"
              value={startTimeLocal}
              onChange={(e) => {
                setStartTimeLocal(e.target.value);
                // Auto-set end time to 1 hour later if not set
                if (!endTimeLocal && e.target.value) {
                  const start = new Date(e.target.value);
                  start.setHours(start.getHours() + 1);
                  const endStr = start.toISOString().slice(0, 16);
                  setEndTimeLocal(endStr);
                }
              }}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label htmlFor="endTime" className="block text-sm font-medium text-slate-700 mb-2">
              <Clock className="inline h-4 w-4 mr-1" />
              End Date & Time <span className="text-red-500">*</span>
            </label>
            <input
              type="datetime-local"
              id="endTime"
              name="endTime"
              value={endTimeLocal}
              onChange={(e) => setEndTimeLocal(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>
        </div>

        {/* Group Size and Price */}
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="maxStudents" className="block text-sm font-medium text-slate-700 mb-2">
              <Users className="inline h-4 w-4 mr-1" />
              Max Students (2-10) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              id="maxStudents"
              name="maxStudents"
              min="2"
              max="10"
              value={formData.maxStudents || 5}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label htmlFor="pricePerStudent" className="block text-sm font-medium text-slate-700 mb-2">
              <IndianRupee className="inline h-4 w-4 mr-1" />
              Tokens per Student <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              id="pricePerStudent"
              name="pricePerStudent"
              min="0"
              step="0.01"
              value={formData.pricePerStudent || 50}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-slate-700 mb-2">
            Session Notes (Optional)
          </label>
          <textarea
            id="notes"
            name="notes"
            value={formData.notes || ""}
            onChange={handleChange}
            rows={4}
            placeholder="Add any additional details about the session..."
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Demo Session Checkbox */}
        <div className="flex items-center">
          <input
            type="checkbox"
            id="isDemo"
            name="isDemo"
            checked={formData.isDemo || false}
            onChange={handleChange}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 rounded"
          />
          <label htmlFor="isDemo" className="ml-2 text-sm text-slate-700">
            This is a demo/trial session (free)
          </label>
        </div>

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Video className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-700">
              <p className="font-medium mb-1">Google Meet Integration</p>
              <p>A Google Meet link will be automatically generated when students join your session.</p>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => navigate("/tutor/sessions")}
            className="px-6 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
              loading
                ? "bg-blue-400 text-white cursor-wait"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {loading ? "Creating..." : "Create Group Session"}
          </button>
        </div>
      </form>
    </div>
  );
}
