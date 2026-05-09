// 数据库类型定义
export interface Database {
  public: {
    Tables: {
      users: {
        Row: User;
        Insert: Omit<User, 'id' | 'created_at' | 'login_count'>;
        Update: Partial<Omit<User, 'id'>>;
      };
      roles: {
        Row: Role;
        Insert: Omit<Role, 'id' | 'created_at'>;
        Update: Partial<Omit<Role, 'id'>>;
      };
      user_roles: {
        Row: UserRole;
        Insert: Omit<UserRole, 'id' | 'assigned_at'>;
        Update: Partial<Omit<UserRole, 'id'>>;
      };
      groups: {
        Row: Group;
        Insert: Omit<Group, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Group, 'id'>>;
      };
      user_groups: {
        Row: UserGroup;
        Insert: Omit<UserGroup, 'id' | 'joined_at'>;
        Update: Partial<Omit<UserGroup, 'id'>>;
      };
      overtime_types: {
        Row: OvertimeType;
        Insert: Omit<OvertimeType, 'id' | 'created_at'>;
        Update: Partial<Omit<OvertimeType, 'id'>>;
      };
      workloss_types: {
        Row: WorklossType;
        Insert: Omit<WorklossType, 'id' | 'created_at'>;
        Update: Partial<Omit<WorklossType, 'id'>>;
      };
      overtime_records: {
        Row: OvertimeRecord;
        Insert: Omit<OvertimeRecord, 'id' | 'created_at' | 'updated_at' | 'duration_minutes' | 'anomaly_flag' | 'anomaly_reason'>;
        Update: Partial<Omit<OvertimeRecord, 'id' | 'duration_minutes'>>;
      };
      workloss_records: {
        Row: WorklossRecord;
        Insert: Omit<WorklossRecord, 'id' | 'created_at' | 'updated_at' | 'duration_minutes' | 'anomaly_flag' | 'anomaly_reason'>;
        Update: Partial<Omit<WorklossRecord, 'id' | 'duration_minutes'>>;
      };
      notifications: {
        Row: Notification;
        Insert: Omit<Notification, 'id' | 'created_at'>;
        Update: Partial<Omit<Notification, 'id'>>;
      };
      audit_logs: {
        Row: AuditLog;
        Insert: Omit<AuditLog, 'id' | 'created_at'>;
        Update: never;
      };
      permission_requests: {
        Row: PermissionRequest;
        Insert: Omit<PermissionRequest, 'id' | 'created_at'>;
        Update: Partial<Omit<PermissionRequest, 'id'>>;
      };
    };
    Functions: {
      get_user_monthly_stats: {
        Args: { p_user_id: string; p_year: number; p_month: number };
        Returns: MonthlyStats[];
      };
    };
  };
}

// 基础类型
export interface User {
  id: string;
  mis: string;
  name: string;
  avatar: string | null;
  status: 'active' | 'inactive' | 'frozen';
  department: string | null;
  password_hash: string | null;
  created_at: string;
  last_login: string | null;
  login_count: number;
}

export interface Role {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  level: number;
  permissions: Record<string, boolean>;
  created_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role_id: string;
  assigned_by: string | null;
  assigned_at: string;
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  color: string;
  leader_id: string | null;
  parent_id: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserGroup {
  id: string;
  user_id: string;
  group_id: string;
  joined_at: string;
}

export interface OvertimeType {
  id: string;
  name: string;
  code: string;
  description: string | null;
  multiplier: number;
  color: string;
  is_active: boolean;
  created_at: string;
}

export interface WorklossType {
  id: string;
  name: string;
  code: string;
  description: string | null;
  color: string;
  is_active: boolean;
  created_at: string;
}

export interface OvertimeRecord {
  id: string;
  user_id: string;
  type_id: string;
  date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  workload_description: string | null;
  workload_amount: number | null;
  efficiency_score: number;
  expected_duration_minutes: number | null;
  anomaly_flag: boolean;
  anomaly_reason: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'revoked';
  submitted_at: string;
  reviewer_id: string | null;
  reviewed_at: string | null;
  review_comment: string | null;
  attachments: unknown[];
  created_at: string;
  updated_at: string;
}

export interface WorklossRecord {
  id: string;
  user_id: string;
  type_id: string;
  date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  description: string;
  impact_level: 'low' | 'medium' | 'high' | 'critical';
  affected_tasks: string | null;
  workload_lost: number | null;
  efficiency_before: number;
  efficiency_after: number;
  anomaly_flag: boolean;
  anomaly_reason: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'revoked';
  submitted_at: string;
  reviewer_id: string | null;
  reviewed_at: string | null;
  review_comment: string | null;
  attachments: unknown[];
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  content: string | null;
  type: 'approval_request' | 'approval_result' | 'anomaly_alert' | 'system' | 'reminder';
  related_type: string | null;
  related_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  old_value: unknown | null;
  new_value: unknown | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface PermissionRequest {
  id: string;
  requester_id: string;
  requested_role: string;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewer_id: string | null;
  reviewed_at: string | null;
  review_comment: string | null;
  created_at: string;
}

export interface MonthlyStats {
  total_overtime_minutes: number;
  total_workloss_minutes: number;
  overtime_count: number;
  workloss_count: number;
  approved_overtime_minutes: number;
  approved_workloss_minutes: number;
  anomaly_count: number;
  avg_efficiency: number;
}

// 扩展类型（带关联数据）
export interface UserWithRoles extends User {
  roles: Role[];
  groups: Group[];
}

export interface OvertimeRecordWithDetails extends OvertimeRecord {
  user: User;
  type: OvertimeType;
  reviewer: User | null;
}

export interface WorklossRecordWithDetails extends WorklossRecord {
  user: User;
  type: WorklossType;
  reviewer: User | null;
}
