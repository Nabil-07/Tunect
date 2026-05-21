import api from './apiClient';

export type BotMessage = { id: string; from: 'user' | 'bot'; text: string; createdAt: string };

export interface ChatMessage {
  message: string;
  role?: string;
  jwt_token?: string;
  thread_id?: string;
}

export interface ChatResponse {
  answer: string;
  thread_id: string;
}

export async function sendChatMessage(data: ChatMessage): Promise<ChatResponse> {
  const response = await api.post<ChatResponse>('/chatbot/chat', data);
  return response.data;
}