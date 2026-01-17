import api from '../lib/apiClient';

export type SupportTicketStatus = 'OPEN' | 'ASSIGNED' | 'RESOLVED' | 'CLOSED';

export type SupportTicket = {
  id: string;
  ticketNumber: number;
  userId: string;
  assignedToId?: string | null;
  status: SupportTicketStatus;
  subject?: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  user?: { id: string; name?: string; email?: string; role?: string };
  assignedTo?: { id: string; name?: string; email?: string } | null;
};

export type SupportMessage = {
  id: string;
  ticketId: string;
  senderId: string;
  message: string;
  createdAt: string;
  sender?: { id: string; name?: string; email?: string; role?: string };
};

export async function createSupportTicket(payload: { subject?: string; message: string }) {
  const { data } = await api.post('/support/tickets', payload);
  return data as SupportTicket;
}

export async function listMySupportTickets() {
  const { data } = await api.get('/support/tickets/my');
  return (data || []) as SupportTicket[];
}

export async function listUnassignedSupportTickets() {
  const { data } = await api.get('/support/tickets/unassigned');
  return (data || []) as SupportTicket[];
}

export async function listAssignedSupportTickets() {
  const { data } = await api.get('/support/tickets/assigned');
  return (data || []) as SupportTicket[];
}

export async function getSupportTicket(ticketId: string) {
  const { data } = await api.get(`/support/tickets/${ticketId}`);
  return data as SupportTicket & { messages: SupportMessage[] };
}

export async function addSupportMessage(ticketId: string, message: string) {
  const { data } = await api.post(`/support/tickets/${ticketId}/messages`, { message });
  return data as SupportMessage;
}

export async function assignSupportTicket(ticketId: string) {
  const { data } = await api.patch(`/support/tickets/${ticketId}/assign`);
  return data as SupportTicket;
}

export async function updateSupportTicketStatus(ticketId: string, status: SupportTicketStatus) {
  const { data } = await api.patch(`/support/tickets/${ticketId}/status`, { status });
  return data as SupportTicket;
}
