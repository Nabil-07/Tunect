// src/admin-controls/admin-controls.types.ts

export interface MaintenanceBreak {
  enabled: boolean;
  message: string;
  startTime: string; // ISO 8601
  endTime: string;   // ISO 8601
}

export interface AdminControls {
  /** Whether the tutor role is available for selection on choose-role page */
  tutorRoleEnabled: boolean;
  /** Whether the student role is available for selection on choose-role page */
  studentRoleEnabled: boolean;
  /** Maintenance break configuration – shown as a dismissible modal to users */
  maintenanceBreak: MaintenanceBreak | null;
}

export const DEFAULT_ADMIN_CONTROLS: AdminControls = {
  tutorRoleEnabled: true,
  studentRoleEnabled: false,
  maintenanceBreak: null,
};
