export type BookingPerson = {
  id?: string;
  name?: string;
  email?: string;
};

export type BookingLike = {
  tutor?: BookingPerson | null;
  student?: BookingPerson | null;
  tutorId?: string | null;
  studentId?: string | null;
};

export type BookingPerspective = {
  isTutor: boolean;
  isStudent: boolean;
  self: Required<Pick<BookingPerson, "id">> & { name: string; email?: string };
  other: Required<Pick<BookingPerson, "id">> & { name: string; email?: string };
};

function normEmail(v: string | null | undefined) {
  return (v || "").trim().toLowerCase();
}

function normName(v: string | null | undefined, fallback: string) {
  const s = (v || "").trim();
  return s || fallback;
}

/**
 * Check if an email string looks encrypted (long string without @ symbol)
 */
function isEmailEncrypted(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.length > 50 && !email.toLowerCase().includes('@');
}

/**
 * Determine which side of a booking the current user is on (tutor vs student)
 * and return a consistent "self/other" view used by UI (Call with X, etc.).
 *
 * Matching rules:
 * - If user.id matches tutor.id OR user.email matches tutor.email => user is tutor.
 * - Else if user.id matches student.id OR user.email matches student.email => user is student.
 * - Else return null.
 * 
 * Note: Email matching is skipped if emails appear encrypted (to handle PII encryption).
 */
export function getBookingPerspective(user: BookingPerson | null | undefined, booking: BookingLike | null | undefined): BookingPerspective | null {
  if (!user || !booking) return null;

  const userId = user.id || undefined;
  const userEmail = normEmail(user.email);
  const userEmailEncrypted = isEmailEncrypted(user.email);

  const tutor = booking.tutor ?? (booking.tutorId ? { id: booking.tutorId } : null);
  const student = booking.student ?? (booking.studentId ? { id: booking.studentId } : null);

  const tutorId = tutor?.id || undefined;
  const studentId = student?.id || undefined;

  const tutorEmail = normEmail(tutor?.email);
  const studentEmail = normEmail(student?.email);
  const tutorEmailEncrypted = isEmailEncrypted(tutor?.email);
  const studentEmailEncrypted = isEmailEncrypted(student?.email);

  // Match by ID first (most reliable)
  const userMatchesTutorById = !!userId && !!tutorId && userId === tutorId;
  const userMatchesStudentById = !!userId && !!studentId && userId === studentId;

  // Match by email only if emails are not encrypted
  const userMatchesTutorByEmail = 
    !userEmailEncrypted && !tutorEmailEncrypted &&
    !!userEmail && !!tutorEmail && userEmail === tutorEmail;
  
  const userMatchesStudentByEmail = 
    !userEmailEncrypted && !studentEmailEncrypted &&
    !!userEmail && !!studentEmail && userEmail === studentEmail;

  const userMatchesTutor = userMatchesTutorById || userMatchesTutorByEmail;
  const userMatchesStudent = userMatchesStudentById || userMatchesStudentByEmail;

  if (userMatchesTutor && tutorId && studentId) {
    return {
      isTutor: true,
      isStudent: false,
      self: { id: tutorId, name: normName(tutor?.name, "Tutor"), email: tutor?.email },
      other: { id: studentId, name: normName(student?.name, "Student"), email: student?.email },
    };
  }

  if (userMatchesStudent && tutorId && studentId) {
    return {
      isTutor: false,
      isStudent: true,
      self: { id: studentId, name: normName(student?.name, "Student"), email: student?.email },
      other: { id: tutorId, name: normName(tutor?.name, "Tutor"), email: tutor?.email },
    };
  }

  return null;
}

