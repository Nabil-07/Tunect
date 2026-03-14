import api from './apiClient';

export type TutorStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type KycReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type KycApplicationStatus = 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'PENDING';

export interface KycCorrectionRequest {
	version: 1;
	fields: string[];
	message?: string;
	requestedAt: string;
	requestedBy: string;
}

export interface AdminDashboard {
	totals: {
		users: number;
		tutors: number;
		students: number;
		bookings: number;
		payments: number;
		revenueInMinor: number;
	};
	latestSignups: Array<{ id: string; email: string; role: string; createdAt: string }>;
	pendingKyc: number;
}

export interface PaginationMeta {
	page: number;
	pageSize: number;
	total: number;
	totalPages: number;
}

export interface Paginated<T> {
	items: T[];
	meta: PaginationMeta;
}

export interface TutorSummary {
	id: string;
	bio: string | null;
	hourlyRate: number | null;
	status: TutorStatus;
	subjects: string[];
	createdAt: string;
	demeritPoints?: number;
	isTrending?: boolean;
	profileCompletion?: number;
	user: {
		id: string;
		email: string;
		name: string | null;
		isBanned: boolean;
		bannedScope: string | null;
		bannedAt: string | null;
		piiStrikes: number;
		piiMaxStrikes: number;
		terms?: {
			accepted: boolean;
			version: number | null;
			acceptedAt: string | null;
		};
	};
}

export interface StudentSummary {
	id: string;
	grade: string | null;
	tokens: number;
	createdAt: string;
	profileCompletion?: number;
	profileStatus?: string;
	user: {
		id: string;
		email: string;
		name: string | null;
		isBanned: boolean;
		bannedScope: string | null;
		bannedAt: string | null;
		piiStrikes: number;
		piiMaxStrikes: number;
		terms?: {
			accepted: boolean;
			version: number | null;
			acceptedAt: string | null;
		};
	};
}

export interface KycItem {
	id: string;
	docType: string;
	url: string;
	status: KycReviewStatus;
	notes?: string | null;
	createdAt: string;
	tutor: { id: string; user: { email: string } };
}

export interface KycApplication {
	id: string;
	status: KycApplicationStatus;
	createdAt: string;
	updatedAt: string;
	rejectionCount?: number;
	reapplyAfter?: string | null;
	notes?: string | null;
	correctionRequest?: KycCorrectionRequest | null;
	fullName: string;
	dob: string;
	phone: string;
	country: string;
	address1: string;
	address2?: string | null;
	city: string;
	state?: string | null;
	postalCode?: string | null;
	bankAccountHolder: string;
	bankName: string;
	bankBranch?: string | null;
	accountNumber?: string | null;
	ifsc?: string | null;
	upiId?: string | null;
	aadhaarNumber?: string | null;
	iban?: string | null;
	swift?: string | null;
}

export interface KycBundle {
	tutor: { id: string; user: { email: string; name?: string | null } };
	application: KycApplication | null;
	documents: KycItem[];
}

export interface PolicyConfig {
	legal: {
		businessName: string;
		cin: string;
		officialEmail: string;
		supportEmail: string;
		supportPhone: string;
		jurisdictionCity: string;
	};
	student: {
		tokenValidityDays: number;
		tutorCancellationBonusPercent: number;
	};
	tutor: {
		feeSlabs: {
			low: { min: number; max: number; feePercent: number };
			mid: { min: number; max: number; feePercent: number };
			high: { min: number; max: number | null; feePercent: number };
		};
		demerit: {
			lateJoinMinutes: number;
			thresholdPoints: number;
			extraFeePercent: number;
			extraFeeBookings: number;
			cancelPenaltyInr: number;
		};
	};
	platform: {
		classInfra: string;
	};
}

export interface AdminPolicyConfigResponse {
	config: PolicyConfig;
	lastUpdatedAt: string | null;
	lastUpdatedBy: string | null;
	lastUpdatedById: string | null;
}

export async function fetchDashboard(): Promise<AdminDashboard> {
	const { data } = await api.get('/admin/dashboard');
	return data;
}

export async function fetchTutors(params: {
	status?: TutorStatus;
	q?: string;
	page?: number;
	pageSize?: number;
} = {}): Promise<Paginated<TutorSummary>> {
	const { data } = await api.get('/admin/tutors', { params });
	return data;
}

export async function updateTutorStatus(id: string, status: TutorStatus) {
	const { data } = await api.patch(`/admin/tutors/${id}/status`, { status });
	return data as { id: string; status: TutorStatus; updatedAt: string };
}

export async function setTutorTrending(id: string, isTrending: boolean) {
	const { data } = await api.patch(`/admin/tutors/${id}/trending`, { isTrending });
	return data as { id: string; isTrending: boolean; updatedAt: string };
}

export async function fetchStudents(params: { q?: string; page?: number; pageSize?: number } = {}): Promise<Paginated<StudentSummary>> {
	const { data } = await api.get('/admin/students', { params });
	return data;
}

export async function fetchStudentDetail(studentId: string) {
	const { data } = await api.get(`/admin/students/${studentId}`);
	return data;
}

export async function fetchTutorDetail(tutorId: string) {
	const { data } = await api.get(`/admin/tutors/${tutorId}`);
	return data;
}

export async function fetchKycQueue(params: { status?: 'PENDING' | 'APPROVED' | 'REJECTED'; page?: number; pageSize?: number } = {}) {
	const { data } = await api.get('/kyc', { params });
	return data as Paginated<KycItem>;
}

export async function approveKyc(id: string, notes?: string) {
	const { data } = await api.patch(`/kyc/${id}`, { status: 'APPROVED', notes });
	return data as KycItem;
}

export async function rejectKyc(id: string, notes?: string) {
	const { data } = await api.patch(`/kyc/${id}`, { status: 'REJECTED', notes });
	return data as KycItem;
}

export async function reviewKyc(id: string, status: 'PENDING' | 'APPROVED' | 'REJECTED', notes?: string) {
	const { data } = await api.patch(`/kyc/doc/${id}`, { status, notes });
	return data as KycItem;
}

export async function fetchKycBundle(tutorId: string): Promise<KycBundle> {
	const { data } = await api.get(`/kyc/admin/${tutorId}`);
	return data as KycBundle;
}

export async function requestKycResubmission(tutorId: string, fields: string[], message?: string) {
	const body = { fields, message };
	const { data } = await api.post(`/kyc/admin/${tutorId}/request-resubmission`, body);
	return data as {
		ok: boolean;
		applicationId: string;
		status: KycApplicationStatus;
		correctionRequest: KycCorrectionRequest;
	};
}

export async function sendSubjectBroadcast(subject: string, message: string) {
	const res = await api.post('/chat/broadcast', {
		message,
		subject: subject.trim() || undefined,
	});
	return res.data;
}

export async function sendAdminPrivateMessage(recipientId: string, message: string) {
	const res = await api.post('/chat/private-message', {
		recipientId,
		message,
	});
	return res.data;
}

export async function fetchBroadcastHistory(page = 1, pageSize = 20) {
	const { data } = await api.get('/chat/broadcasts', { params: { page, pageSize } });
	return data;
}

export async function fetchPrivateMessageHistory(page = 1, pageSize = 20) {
	const { data } = await api.get('/chat/private-messages', { params: { page, pageSize } });
	return data;
}

export async function fetchDistinctSubjects(): Promise<string[]> {
	const { data } = await api.get('/chat/subjects');
	return data;
}

export async function unbanUser(userId: string) {
	const { data } = await api.post(`/admin/users/${userId}/unban`);
	return data;
}

export async function fetchAdminPolicyConfig(): Promise<AdminPolicyConfigResponse> {
	const { data } = await api.get('/admin/policy-config');
	return data;
}

export async function updateAdminPolicyConfig(partial: Partial<PolicyConfig>) {
	const { data } = await api.patch('/admin/policy-config', partial);
	return data as { ok: boolean; config: PolicyConfig };
}
