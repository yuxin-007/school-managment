import React from 'react'
import {
  ApartmentOutlined,
  BankOutlined,
  BookOutlined,
  FolderOpenOutlined,
  NodeIndexOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  UsergroupAddOutlined,
} from '@ant-design/icons'
import type { OrganizationCatalogItem, OrganizationNodeType } from './types'

const iconMap: Record<string, React.ReactNode> = {
  safety: <SafetyCertificateOutlined />,
  bank: <BankOutlined />,
  apartment: <ApartmentOutlined />,
  cluster: <NodeIndexOutlined />,
  team: <TeamOutlined />,
  read: <BookOutlined />,
  group: <UsergroupAddOutlined />,
  folder: <FolderOpenOutlined />,
}

const fallbackMeta: Record<OrganizationNodeType, { label: string; color: string; icon: string }> = {
  system: { label: '系统管理员', color: 'red', icon: 'safety' },
  school: { label: '学校', color: 'blue', icon: 'bank' },
  college: { label: '学院', color: 'purple', icon: 'apartment' },
  department: { label: '系/专业', color: 'cyan', icon: 'cluster' },
  staff: { label: '教职工', color: 'green', icon: 'team' },
  student: { label: '学生', color: 'gold', icon: 'read' },
  class: { label: '班级/项目组', color: 'orange', icon: 'group' },
  org: { label: '业务小组', color: 'default', icon: 'folder' },
}

export function getOrganizationVisual(
  nodeType: OrganizationNodeType,
  catalog?: OrganizationCatalogItem[],
) {
  const item = catalog?.find((entry) => entry.key === nodeType)
  const meta = item ?? fallbackMeta[nodeType]

  return {
    label: meta.label,
    color: meta.color,
    iconName: meta.icon,
    icon: iconMap[meta.icon] ?? <FolderOpenOutlined />,
  }
}

export function flattenOrganizationTree(nodes: Array<{ children?: any[] }>): any[] {
  return nodes.flatMap((node) => [node, ...flattenOrganizationTree(node.children ?? [])])
}

export function filterOrganizationTree<T extends { name: string; children?: T[] }>(
  nodes: T[],
  keyword: string,
): T[] {
  const normalizedKeyword = keyword.trim().toLowerCase()
  if (!normalizedKeyword) {
    return nodes
  }

  return nodes.reduce<T[]>((result, node) => {
    const filteredChildren = filterOrganizationTree(node.children ?? [], keyword)
    const matched = node.name.toLowerCase().includes(normalizedKeyword)

    if (matched || filteredChildren.length > 0) {
      result.push({
        ...node,
        children: filteredChildren,
      })
    }

    return result
  }, [])
}
