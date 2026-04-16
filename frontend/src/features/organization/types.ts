export type OrganizationNodeType =
  | 'system'
  | 'school'
  | 'college'
  | 'department'
  | 'staff'
  | 'student'
  | 'class'
  | 'org'

export interface OrganizationNodePayload {
  id: number
  name: string
  node_type: OrganizationNodeType
  node_type_label: string
  code?: string
  description?: string
  parent_id?: number | null
  children_count: number
  users_count: number
  type_color: string
  type_icon: string
}

export interface OrganizationTreeNode {
  id: number
  key: string
  title: string
  name: string
  node_type: OrganizationNodeType
  node_type_label: string
  type_color: string
  type_icon: string
  data: OrganizationNodePayload
  children?: OrganizationTreeNode[]
  is_leaf?: boolean
}

export interface OrganizationDistributionItem {
  node_type: OrganizationNodeType
  label: string
  color: string
  count: number
}

export interface OrganizationCatalogItem {
  key: OrganizationNodeType
  label: string
  level: number
  color: string
  icon: string
  raw_key: string
  allowed_children: OrganizationNodeType[]
}

export interface OrganizationOverview {
  summary: {
    total_nodes: number
    accessible_users: number
    primary_assignments: number
    unassigned_users: number
    school_count: number
    college_count: number
    staff_count: number
    student_count: number
  }
  distribution: OrganizationDistributionItem[]
  catalog: OrganizationCatalogItem[]
  hierarchy: string[]
  root_names: string[]
}

export interface OrganizationNodePathItem {
  id: number
  name: string
  node_type: OrganizationNodeType
  node_type_label: string
}

export interface OrganizationNodeUsersMeta {
  node_path: OrganizationNodePathItem[]
  creatable_types: OrganizationNodeType[]
  assignable_user_count?: number
  member_summary?: {
    total: number
    primary_count: number
    by_role: Record<string, number>
  }
  permissions?: {
    can_create_child: boolean
    can_edit_node: boolean
    can_delete_node: boolean
    can_move_node: boolean
    can_assign_users: boolean
    can_remove_users: boolean
  }
}

export interface OrganizationUserRecord {
  id: number
  username: string
  real_name: string
  role: 'super_admin' | 'college_admin' | 'staff' | 'student'
  role_display: string
  employee_id?: string
  student_id?: string
  position?: string
  department_name?: string
  organization_count?: number
  role_in_node?: string
  is_primary?: boolean
}
