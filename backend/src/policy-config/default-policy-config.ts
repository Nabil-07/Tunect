export type PolicyConfig = {
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
};

export const DEFAULT_POLICY_CONFIG: PolicyConfig = {
  legal: {
    businessName: 'Tunect Private Limited',
    cin: 'U85500BR2026PTC081390',
    officialEmail: 'official@tunectnow.com',
    supportEmail: 'support@tunectnow.com',
    supportPhone: '+91 7903464425',
    jurisdictionCity: 'Patna',
  },
  student: {
    tokenValidityDays: 60,
    tutorCancellationBonusPercent: 0,
  },
  tutor: {
    feeSlabs: {
      low: { min: 0, max: 399, feePercent: 25 },
      mid: { min: 400, max: 699, feePercent: 22 },
      high: { min: 700, max: null, feePercent: 18 },
    },
    demerit: {
      lateJoinMinutes: 10,
      thresholdPoints: 3,
      extraFeePercent: 3,
      extraFeeBookings: 10,
      cancelPenaltyInr: 200,
    },
  },
  platform: {
    classInfra: 'LiveKit',
  },
};
