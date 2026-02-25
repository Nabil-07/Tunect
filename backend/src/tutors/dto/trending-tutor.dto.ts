// Response DTO for /tutors/trending
export interface TrendingTutorDto {
  id: string;
  name: string;        // from user.name or fallback
  subject: string;     // first of Tutor.subjects or "General"
  subjects?: string[]; // all subjects
  classesTeach?: string[]; // classes/grades the tutor teaches
  country?: string;    // optional
  rating: number;      // avg rating (2 decimals) or fallback
  hourly: number;      // INR per hour
  img?: string;
  badges?: string[];
}

export interface TrendingTutorsResponse {
  items: TrendingTutorDto[];
  total: number;
  page: number;
  pageSize: number;
}
