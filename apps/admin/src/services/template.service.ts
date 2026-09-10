import { supabase } from '../lib/supabase';
import type { PlanDaySpec } from '@milk-transfer/shared';
import type { PlanTemplateInsert, PlanTemplateRow } from '../types';

export interface TemplatePatch {
  name?: string;
  method?: PlanTemplateInsert['method'];
  days?: PlanDaySpec[];
  enabled?: boolean;
  isDefault?: boolean;
}

/** 转奶方法模板（C2：运营可配置默认节奏；进行中的计划锁定创建时版本，不受后续调整影响） */
export const TemplateService = {
  /** 管理员全量列表（含停用） */
  async list(): Promise<PlanTemplateRow[]> {
    const { data, error } = await supabase
      .from('plan_templates')
      .select('*')
      .order('method')
      .order('created_at');
    if (error) throw error;
    return data ?? [];
  },

  async create(row: PlanTemplateInsert): Promise<PlanTemplateRow> {
    const { data, error } = await supabase.from('plan_templates').insert(row).select().single();
    if (error) throw error;
    return data;
  },

  /** 更新内容时 version 自动 +1（旧计划按 template_version 锁定不受影响，03 §2.3） */
  async update(id: string, patch: TemplatePatch): Promise<PlanTemplateRow> {
    const { data: current } = await supabase
      .from('plan_templates')
      .select('version')
      .eq('id', id)
      .single();
    if (!current) throw new Error('模板不存在');

    const contentChanged =
      patch.days !== undefined || patch.name !== undefined || patch.method !== undefined;

    // is_default 唯一：设为默认前先取消同 method 下的其他默认
    if (patch.isDefault) {
      const { data: self } = await supabase
        .from('plan_templates')
        .select('method')
        .eq('id', id)
        .single();
      if (self) {
        const { error: unsetError } = await supabase
          .from('plan_templates')
          .update({ is_default: false })
          .eq('method', self.method)
          .eq('is_default', true)
          .neq('id', id);
        if (unsetError) throw unsetError;
      }
    }

    const { data, error } = await supabase
      .from('plan_templates')
      .update({
        ...patch,
        ...(contentChanged ? { version: current.version + 1 } : {}),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('plan_templates').delete().eq('id', id);
    if (error) throw error;
  },
};
