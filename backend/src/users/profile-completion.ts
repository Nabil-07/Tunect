// Helper functions to check profile completion status

export interface StudentProfileStatus {
  isComplete: boolean;
  completionPercentage: number;
  missingFields: string[];
}

export interface TutorProfileStatus {
  isComplete: boolean;
  completionPercentage: number;
  missingFields: string[];
}

export function checkStudentProfileCompletion(student: any): StudentProfileStatus {
  const totalFields = 5;
  let completedFields = 0;
  const missingFields: string[] = [];

  // Check mandatory fields
  if (student.user?.name && student.user.name.trim()) {
    completedFields++;
  } else {
    missingFields.push('Full Name');
  }

  if (student.user?.email && student.user.email.trim()) {
    completedFields++;
  } else {
    missingFields.push('Email');
  }

  if (student.grade && student.grade.trim()) {
    completedFields++;
  } else {
    missingFields.push('Grade/Class');
  }

  if (student.timezone && student.timezone.trim()) {
    completedFields++;
  } else {
    missingFields.push('Timezone');
  }

  if (student.preferredLanguage && student.preferredLanguage.trim()) {
    completedFields++;
  } else {
    missingFields.push('Preferred Language');
  }

  return {
    isComplete: missingFields.length === 0,
    completionPercentage: Math.round((completedFields / totalFields) * 100),
    missingFields,
  };
}

export function checkTutorProfileCompletion(tutor: any): TutorProfileStatus {
  const totalFields = 8;
  let completedFields = 0;
  const missingFields: string[] = [];

  // Check mandatory fields
  if (tutor.user?.name && tutor.user.name.trim()) {
    completedFields++;
  } else {
    missingFields.push('Full Name');
  }

  if (tutor.bio && tutor.bio.trim()) {
    completedFields++;
  } else {
    missingFields.push('Bio/Summary');
  }

  if (tutor.subjects && Array.isArray(tutor.subjects) && tutor.subjects.length > 0) {
    completedFields++;
  } else {
    missingFields.push('Subjects');
  }

  if (tutor.languages && Array.isArray(tutor.languages) && tutor.languages.length > 0) {
    completedFields++;
  } else {
    missingFields.push('Languages');
  }

  if (tutor.qualifications && tutor.qualifications.trim()) {
    completedFields++;
  } else {
    missingFields.push('Qualifications');
  }

  if (tutor.yearsExperience && tutor.yearsExperience > 0) {
    completedFields++;
  } else {
    missingFields.push('Years of Experience');
  }

  if (tutor.hourlyRate && tutor.hourlyRate > 0) {
    completedFields++;
  } else {
    missingFields.push('Hourly Rate');
  }

  if (tutor.status && tutor.status === 'APPROVED') {
    completedFields++;
  } else {
    missingFields.push('KYC Verification');
  }

  return {
    isComplete: missingFields.length === 0,
    completionPercentage: Math.round((completedFields / totalFields) * 100),
    missingFields,
  };
}
