import { http as api } from '../api/http';

export type CreateReviewPayload = {
  bookingId: string;
  rating: number;
  comment?: string;
};

export type ReviewDto = {
  id: string;
  bookingId: string;
  tutorId: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
  tutor?: { id: string; user?: { name?: string; email?: string } } | null;
};

export async function createReview(payload: CreateReviewPayload) {
  const { data } = await api.post<ReviewDto>('/reviews', payload);
  return data;
}

export async function getMyReviews(page = 1, pageSize = 50) {
  try {
    const { data } = await api.get<{ items: ReviewDto[] }>('/reviews/me', {
      params: { page, pageSize },
    });
    return Array.isArray(data?.items) ? data.items : [];
  } catch (error: any) {
    if (error?.response?.status === 404) {
      return [];
    }
    throw error;
  }
}

export async function getTutorReviews(tutorId: string, page = 1, pageSize = 10) {
  const { data } = await api.get<{
    items: ReviewDto[];
    stats?: { avgRating?: number };
  }>(`/reviews/tutor/${tutorId}`, {
    params: { page, pageSize },
  });
  return data;
}

export async function updateReview(reviewId: string, payload: { rating?: number; comment?: string }) {
  const { data } = await api.put<ReviewDto>(`/reviews/${reviewId}`, payload);
  return data;
}

export async function deleteReview(reviewId: string) {
  const { data } = await api.delete<{ ok: boolean }>(`/reviews/${reviewId}`);
  return data;
}
