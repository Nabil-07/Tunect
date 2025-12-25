// src/pages/student/favorites.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/apiClient";
import { Heart, Star, MessageSquare, Calendar, Trash2 } from "lucide-react";

type FavoriteTutor = {
  id: string;
  createdAt: string;
  tutor: {
    id: string;
    hourlyRate: number;
    subjects: string[];
    user: {
      name: string;
      avatarUrl?: string;
      email: string;
    };
    reviews: Array<{
      rating: number;
    }>;
  };
};

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState<FavoriteTutor[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const loadFavorites = async () => {
    try {
      setLoading(true);
      const res = await api.get("/favorites/my");
      setFavorites(res.data || []);
    } catch (err) {
      console.error("Failed to load favorites", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFavorites();
  }, []);

  const removeFavorite = async (tutorId: string) => {
    try {
      await api.delete(`/favorites/${tutorId}`);
      setFavorites(favorites.filter((f) => f.tutor.id !== tutorId));
    } catch (err) {
      console.error("Failed to remove favorite", err);
      alert("Failed to remove from favorites");
    }
  };

  const getAverageRating = (reviews: Array<{ rating: number }>) => {
    if (reviews.length === 0) return 0;
    const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
    return (sum / reviews.length).toFixed(1);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-6xl mx-auto text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto"></div>
          <p className="text-slate-600 mt-4">Loading favorites...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <Heart className="h-8 w-8 text-red-500 fill-red-500" />
            Favorite Tutors
          </h1>
          <p className="text-slate-600 mt-2">
            {favorites.length} tutor{favorites.length !== 1 ? "s" : ""} saved
          </p>
        </div>

        {favorites.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
            <Heart className="h-16 w-16 text-slate-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-slate-900 mb-2">
              No favorite tutors yet
            </h2>
            <p className="text-slate-600 mb-6">
              Start adding tutors to your favorites to quickly access them later
            </p>
            <button
              onClick={() => navigate("/find-tutors")}
              className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition"
            >
              Browse Tutors
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {favorites.map((fav) => {
              const tutor = fav.tutor;
              const avgRating = getAverageRating(tutor.reviews);

              return (
                <div
                  key={fav.id}
                  className="bg-white rounded-2xl shadow-sm hover:shadow-lg transition border border-slate-200 overflow-hidden"
                >
                  <div className="relative h-32 bg-gradient-to-br from-emerald-500 to-teal-600">
                    {tutor.user.avatarUrl ? (
                      <img
                        src={tutor.user.avatarUrl}
                        alt={tutor.user.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-white text-4xl font-bold">
                          {tutor.user.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <button
                      onClick={() => removeFavorite(tutor.id)}
                      className="absolute top-3 right-3 p-2 bg-white/90 backdrop-blur rounded-full hover:bg-red-50 transition group"
                      title="Remove from favorites"
                    >
                      <Heart className="h-5 w-5 text-red-500 fill-red-500 group-hover:scale-110 transition" />
                    </button>
                  </div>

                  <div className="p-5">
                    <h3 className="text-lg font-bold text-slate-900 mb-1">
                      {tutor.user.name}
                    </h3>

                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
                        <span className="text-sm font-medium text-slate-700">
                          {avgRating}
                        </span>
                      </div>
                      <span className="text-sm text-slate-500">
                        ({tutor.reviews.length} reviews)
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-4">
                      {tutor.subjects.slice(0, 2).map((subject) => (
                        <span
                          key={subject}
                          className="text-xs px-2 py-1 bg-emerald-50 text-emerald-700 rounded-full"
                        >
                          {subject}
                        </span>
                      ))}
                      {tutor.subjects.length > 2 && (
                        <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full">
                          +{tutor.subjects.length - 2}
                        </span>
                      )}
                    </div>

                    <div className="text-lg font-bold text-emerald-600 mb-4">
                      ₹{tutor.hourlyRate}/hour
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => navigate(`/student/messages?to=${tutor.id}`)}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition text-sm font-medium"
                      >
                        <MessageSquare className="h-4 w-4" />
                        Message
                      </button>
                      <button
                        onClick={() => navigate(`/student/cart?tutorId=${tutor.id}`)}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition text-sm font-medium"
                      >
                        <Calendar className="h-4 w-4" />
                        Book
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
