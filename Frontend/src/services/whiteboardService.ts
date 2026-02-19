import { http } from '../api/http';

export const whiteboardService = {
  /**
   * Get whiteboard data for a booking
   */
  async getWhiteboardData(bookingId: string) {
    const response = await http.get(`/whiteboard/${bookingId}`);
    return response.data;
  },

  /**
   * Save whiteboard data
   */
  async saveWhiteboardData(bookingId: string, data: any) {
    const response = await http.post(`/whiteboard/${bookingId}`, data);
    return response.data;
  },

  /**
   * Export whiteboard to S3 (optional)
   */
  async exportToS3(bookingId: string) {
    const response = await http.post(`/whiteboard/${bookingId}/export`, {});
    return response.data;
  },

  /**
   * Save whiteboard as shared notes (visible to both tutor and student)
   */
  async saveWhiteboardNotes(bookingId: string, noteName: string, wbData: any) {
    const response = await http.post(`/whiteboard/${bookingId}/share-notes`, {
      noteName,
      data: wbData,
    });
    return response.data;
  },

  /**
   * Get shared whiteboard notes for a booking
   */
  async getWhiteboardNotes(bookingId: string) {
    const response = await http.get(`/whiteboard/${bookingId}/notes`);
    return response.data;
  },
};
