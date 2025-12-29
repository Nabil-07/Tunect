import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const whiteboardService = {
  /**
   * Get whiteboard data for a booking
   */
  async getWhiteboardData(bookingId: string) {
    const response = await axios.get(`${API_BASE}/whiteboard/${bookingId}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    });
    return response.data;
  },

  /**
   * Save whiteboard data
   */
  async saveWhiteboardData(bookingId: string, data: any) {
    const response = await axios.post(
      `${API_BASE}/whiteboard/${bookingId}`,
      data,
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data;
  },

  /**
   * Export whiteboard to S3 (optional)
   */
  async exportToS3(bookingId: string) {
    const response = await axios.post(
      `${API_BASE}/whiteboard/${bookingId}/export`,
      {},
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      }
    );
    return response.data;
  },
};
