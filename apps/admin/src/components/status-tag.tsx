import { Tag } from 'antd';

/** 状态枚举 → 中文标签/语义色（审核流转 + 奶粉库上下架共用一张映射） */
const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '待审核', color: 'warning' },
  approved: { label: '已通过', color: 'success' },
  rejected: { label: '已驳回', color: 'error' },
  on_shelf: { label: '上架', color: 'success' },
  off_shelf: { label: '下架', color: 'default' },
};

export function StatusTag({ value }: { value: string }) {
  const item = STATUS_MAP[value];
  return <Tag color={item?.color ?? 'default'}>{item?.label ?? value}</Tag>;
}
