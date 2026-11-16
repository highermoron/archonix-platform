export type UserRole = 'administrator' | 'structural_engineer' | 'inspector' | 'viewer';
export type MonitoringStatus = 'active' | 'attention_required' | 'overdue' | 'archived';
export type InspectionStatus = 'draft' | 'submitted' | 'under_review' | 'changes_requested' | 'approved' | 'archived';
export type SeverityLevel = 'low' | 'moderate' | 'high' | 'critical' | 'unclassified';
export type ReviewStatus = 'pending_review' | 'ai_flagged' | 'engineer_confirmed' | 'rejected' | 'resolved';

export interface UserProfile {
  id: string;
  organisation_id: string;
  full_name: string;
  email: string;
  role: UserRole;
  ner_registration_number?: string;
  is_active: boolean;
}

export interface BuildingProfile {
  id: string;
  building_code: string;
  name: string;
  street_address: string;
  suburb: string;
  state: 'NSW' | 'VIC' | 'QLD' | 'WA' | 'SA' | 'ACT' | 'TAS' | 'NT';
  postcode: string;
  latitude: number;
  longitude: number;
  construction_year: number;
  building_classification: string;
  floors_above_ground: number;
  floors_below_ground: number;
  primary_materials: string[];
  description: string;
  monitoring_status: MonitoringStatus;
  is_demo_data: boolean;
  created_at: string;
}

export interface StructuralFinding {
  id: string;
  defect_code: string;
  building_id: string;
  category: string;
  title: string;
  description: string;
  location_in_building: string;
  severity: SeverityLevel;
  review_status: ReviewStatus;
  recommended_action: string;
  first_recorded_date: string;
  latest_observation_date: string;
  is_resolved: boolean;
}

export interface InspectionRecord {
  id: string;
  inspection_code: string;
  building_id: string;
  inspector_id: string;
  inspection_date: string;
  next_due_date?: string;
  scope_standard: string;
  status: InspectionStatus;
  summary_notes: string;
  weather_conditions?: string;
  is_demo_data: boolean;
}

export interface BuildingTimelineEvent {
  id: string;
  building_id: string;
  event_type: 'inspection' | 'new_defect' | 'severity_change' | 'engineer_review' | 'maintenance' | 'report';
  title: string;
  description: string;
  event_date: string;
}