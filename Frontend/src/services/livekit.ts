import api from "../lib/apiClient";

export type LivekitTokenResponse = {
  token: string;
  room: string;
  identity: string;
};

export async function fetchLivekitToken(bookingId: string) {
  const res = await api.post<LivekitTokenResponse>("/livekit/token", { bookingId });
  console.log('Raw API response:', res);
  console.log('Response data:', res.data);
  console.log('Token type:', typeof res.data?.token, 'Token value:', res.data?.token);
  
  // Ensure token is a string
  if (res.data?.token && typeof res.data.token !== 'string') {
    console.warn('Token is not a string, attempting to extract:', res.data.token);
    // If token is an object, try to extract the JWT string
    const tokenObj = res.data.token as any;
    const extractedToken = tokenObj.value || tokenObj.jwt || tokenObj.token || tokenObj.toString?.() || tokenObj.toJwt?.();
    if (extractedToken && typeof extractedToken === 'string') {
      return { ...res.data, token: extractedToken };
    }
  }
  
  return res.data;
}
