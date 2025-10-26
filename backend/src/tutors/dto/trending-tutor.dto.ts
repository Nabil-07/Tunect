// Response DTO for /tutors/trending
export interface TrendingTutorDto {
  id: string;
  name: string;        // from user.name or fallback
  subject: string;     // first of Tutor.subjects or "General"
  country?: string;    // optional
  rating: number;      // avg rating (2 decimals) or fallback
  hourly: number;      // INR per hour
  img?: string;
  badges?: string[];
}
