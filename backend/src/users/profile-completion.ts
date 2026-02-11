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
  const studentData = student?.student ?? student ?? {};
  const userData = student?.user ?? studentData?.user ?? {};
  const totalFields = 5;
  let completedFields = 0;
  const missingFields: string[] = [];

  // Check mandatory fields
  if (userData?.name && String(userData.name).trim()) {
    completedFields++;
  } else {
    missingFields.push('Full Name');
  }

  if (userData?.email && String(userData.email).trim()) {
    completedFields++;
  } else {
    missingFields.push('Email');
  }

  if (studentData?.grade && String(studentData.grade).trim()) {
    completedFields++;
  } else {
    missingFields.push('Grade/Class');
  }

  if (studentData?.timezone && String(studentData.timezone).trim()) {
    completedFields++;
  } else {
    missingFields.push('Timezone');
  }

  if (studentData?.preferredLanguage && String(studentData.preferredLanguage).trim()) {
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
  const tutorData = tutor?.tutor ?? tutor ?? {};
  const userData = tutor?.user ?? tutorData?.user ?? {};
  const totalFields = 8;
  let completedFields = 0;
  const missingFields: string[] = [];

  // Check mandatory fields
  if ((userData?.name && String(userData.name).trim()) || (tutorData?.name && String(tutorData.name).trim())) {
    completedFields++;
  } else {
    missingFields.push('Full Name');
  }

  if (tutorData?.bio && String(tutorData.bio).trim()) {
    completedFields++;
  } else {
    missingFields.push('Bio/Summary');
  }

  if (Array.isArray(tutorData?.subjects) && tutorData.subjects.length > 0) {
    completedFields++;
  } else {
    missingFields.push('Subjects');
  }

  if (Array.isArray(tutorData?.languages) && tutorData.languages.length > 0) {
    completedFields++;
  } else {
    missingFields.push('Languages');
  }

  if (tutorData?.qualifications && String(tutorData.qualifications).trim()) {
    completedFields++;
  } else {
    missingFields.push('Qualifications');
  }

  if (tutorData?.yearsExperience && Number(tutorData.yearsExperience) > 0) {
    completedFields++;
  } else {
    missingFields.push('Years of Experience');
  }

  if (tutorData?.hourlyRate && Number(tutorData.hourlyRate) > 0) {
    completedFields++;
  } else {
    missingFields.push('Hourly Rate');
  }

  if (
    tutorData?.status === 'APPROVED' ||
    tutorData?.kycStatus === 'APPROVED' ||
    tutorData?.kyc?.status === 'APPROVED'
  ) {
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
