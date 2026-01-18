import api from "../lib/apiClient";

export type LivekitTokenResponse = {
  token: string;
  room: string;
  identity: string;
};

export async function fetchLivekitToken(bookingId: string) {
  const res = await api.post<LivekitTokenResponse>("/livekit/token", { bookingId });
  return res.data;
}
