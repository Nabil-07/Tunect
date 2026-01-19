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
};

export async function createReview(payload: CreateReviewPayload) {
  const { data } = await api.post<ReviewDto>('/reviews', payload);
  return data;
}

export async function getMyReviews(page = 1, pageSize = 50) {
  const { data } = await api.get<{ items: ReviewDto[] }>('/reviews/me', {
    params: { page, pageSize },
  });
  return Array.isArray(data?.items) ? data.items : [];
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
