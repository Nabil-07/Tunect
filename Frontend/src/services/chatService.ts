// Frontend/src/services/chatService.ts
import api from '../api/http';

export type ConversationType = 'DIRECT' | 'GROUP_SESSION' | 'ADMIN_BROADCAST';

export interface Conversation {
  id: string;
  type: ConversationType;
  name?: string; // The other participant's name
  referenceId: string | null;
  isActive: boolean;
  memberCount: number;
  lastMessage: {
    id: string;
    content: string;
    isDeleted: boolean;
    createdAt: string;
    senderId: string;
  } | null;
  createdAt: string;
}

export interface Message {
  id: string;
  conversationId?: string;
  senderId: string;
  content: string;
  isDeleted: boolean;
  deletedBy?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  sender: {
    id: string;
    name: string | null;
    email: string;
  };
}

export interface ConversationDetail {
  id: string;
  type: ConversationType;
  name?: string; // The other participant's name
  referenceId: string | null;
  isActive: boolean;
  createdAt: string;
  nextCursor?: string | null;
  members: Array<{
    id: string;
    userId: string;
    role: 'ADMIN' | 'MEMBER';
    joinedAt: string;
    user: {
      id: string;
      email: string;
      name: string | null;
      role: string;
    };
  }>;
  messages: Message[];
  canPost: boolean;
  tokenBalance: {
    balance: number;
    hasTokens: boolean;
  } | null;
}

export interface CreateBroadcastDto {
  name: string;
  memberIds: string[];
  initialMessage?: string;
}

// List all conversations for current user
export async function listConversations(): Promise<Conversation[]> {
  const response = await api.get('/chat/conversations');
  return response.data.items || [];
}

// Get conversation details with messages
export async function getConversation(conversationId: string): Promise<ConversationDetail> {
  const response = await api.get(`/chat/thread/${conversationId}`);
  return response.data;
}

// Send a message in a conversation
export async function sendMessage(conversationId: string, content: string): Promise<Message> {
  const response = await api.post(`/chat/conversations/${conversationId}/messages`, {
    content,
  });
  return response.data;
}

// Soft delete a message (admin only)
export async function deleteMessage(messageId: string): Promise<{ success: boolean }> {
  const response = await api.delete(`/chat/messages/${messageId}`);
  return response.data;
}

// Create admin broadcast group
export async function createBroadcast(dto: CreateBroadcastDto): Promise<Conversation> {
  const response = await api.post('/chat/broadcast', dto);
  return response.data;
}

// Add members to broadcast
export async function addMembersTo(conversationId: string, userIds: string[]): Promise<{ success: boolean }> {
  const response = await api.post(`/chat/conversations/${conversationId}/members`, {
    userIds,
  });
  return response.data;
}

// Remove members from broadcast
export async function removeMembersFrom(conversationId: string, userIds: string[]): Promise<{ success: boolean }> {
  const response = await api.delete(`/chat/conversations/${conversationId}/members`, {
    data: { userIds },
  });
  return response.data;
}

// Export conversation (admin only)
export async function exportConversation(conversationId: string): Promise<any> {
  const response = await api.get(`/chat/conversations/${conversationId}/export`);
  return response.data;
}

export interface AdminMessage {
  id: string;
  type: 'PRIVATE' | 'BROADCAST';
  subject: string | null;
  message: string;
  senderName: string;
  createdAt: string;
}

// Fetch admin messages received by the current logged-in user
export async function fetchMyAdminMessages(): Promise<AdminMessage[]> {
  const response = await api.get('/chat/my-admin-messages');
  return response.data;
}
