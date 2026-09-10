import Papa from 'papaparse';
import type { MilkProductInsert } from '../types';
import type { PlanDaySpec } from '@milk-transfer/shared';

/**
 * 奶粉库 CSV 导入（FR-B1 首批批量导入工具）。
 *
 * 表头（中文，运营友好）：
 *   品牌,产品名,段位,蛋白类型,版本,注册号,OPO,乳铁蛋白,益生菌,DHA/ARA,含蔗糖,含香精
 * 约定：
 *   - 蛋白类型：整蛋白/部分水解/深度水解/氨基酸
 *   - 版本：国行/海外（默认国行；海外版注册号留空，列表页标注「海外版无国行注册号」）
 *   - 成分列填「是」计为 true，其余（否/空）忽略——小程序端原样渲染 value=true 的键名
 *   - 注册号以 TY 开头自动加「须在医生指导下使用」标记（特医配方，FR-B1/FR-C6）
 *   - 重复行由数据库唯一索引（品牌+产品名+段位+版本）去重，upsert 以后到者为准
 */

const PROTEIN_MAP: Record<string, MilkProductInsert['protein_type']> = {
  整蛋白: 'intact',
  部分水解: 'partially_hydrolyzed',
  深度水解: 'extensively_hydrolyzed',
  氨基酸: 'amino_acid',
};

const REGION_MAP: Record<string, MilkProductInsert['region']> = {
  国行: 'domestic',
  海外: 'overseas',
};

/** 成分列 → ingredients jsonb 键（小程序端按 value=true 渲染键名，见 milk/search 页） */
const INGREDIENT_COLUMNS: Record<string, string> = {
  OPO: 'OPO',
  乳铁蛋白: '乳铁蛋白',
  益生菌: '益生菌',
  'DHA/ARA': 'DHA/ARA',
  含蔗糖: '含蔗糖',
  含香精: '含香精',
};

export const SPECIAL_MEDICAL_LABEL = '须在医生指导下使用';

export const MILK_CSV_TEMPLATE =
  '品牌,产品名,段位,蛋白类型,版本,注册号,OPO,乳铁蛋白,益生菌,DHA/ARA,含蔗糖,含香精\n' +
  '示例品牌,示例幼儿配方奶粉,3,整蛋白,国行,YP2024000000,是,是,否,是,否,否\n';

export interface MilkCsvResult {
  rows: MilkProductInsert[];
  errors: string[];
}

function isYes(value: unknown): boolean {
  return String(value ?? '').trim() === '是';
}

/** 解析并校验 CSV 文本；errors 非空时应阻止导入（行号从 2 起算，1 为表头） */
export function parseMilkCsv(text: string): MilkCsvResult {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });

  const rows: MilkProductInsert[] = [];
  const errors: string[] = [];

  parsed.data.forEach((raw, i) => {
    const line = i + 2;
    const brand = (raw['品牌'] ?? '').trim();
    const name = (raw['产品名'] ?? '').trim();
    const stage = Number(raw['段位']);
    const proteinText = (raw['蛋白类型'] ?? '').trim();
    const regionText = (raw['版本'] ?? '').trim() || '国行';
    const regNo = (raw['注册号'] ?? '').trim() || null;

    if (!brand || !name) {
      errors.push(`第 ${line} 行：品牌与产品名为必填`);
      return;
    }
    if (!Number.isInteger(stage) || stage < 1 || stage > 4) {
      errors.push(`第 ${line} 行：段位须为 1–4 的整数`);
      return;
    }
    const protein = PROTEIN_MAP[proteinText];
    if (!protein) {
      errors.push(`第 ${line} 行：蛋白类型须为 整蛋白/部分水解/深度水解/氨基酸`);
      return;
    }
    const region = REGION_MAP[regionText];
    if (!region) {
      errors.push(`第 ${line} 行：版本须为 国行 或 海外`);
      return;
    }

    const ingredients: Record<string, boolean> = {};
    for (const [column, key] of Object.entries(INGREDIENT_COLUMNS)) {
      if (isYes(raw[column])) ingredients[key] = true;
    }
    // 特医配方（TY 注册号）强制标记，供 FR-C6 强提示读取
    if (regNo && regNo.startsWith('TY')) ingredients[SPECIAL_MEDICAL_LABEL] = true;

    rows.push({ brand, name, stage, protein_type: protein, region, reg_no: regNo, ingredients });
  });

  return { rows, errors };
}

/** 下载 CSV 模板（带 BOM，保证 Excel 打开中文不乱码） */
export function downloadMilkCsvTemplate(): void {
  const blob = new Blob(['\uFEFF' + MILK_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '奶粉库导入模板.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/** 模板 days 行导出为 CSV 预览文本（模板编辑页预览用） */
export function planDaysToCsv(days: PlanDaySpec[]): string {
  return Papa.unparse(days.map((d, i) => ({ 天: i + 1, 新奶占比: d.ratio, 文案: d.label })));
}
