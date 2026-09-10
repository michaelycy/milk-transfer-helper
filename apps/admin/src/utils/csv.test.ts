import { describe, expect, it } from 'vitest';
import { SPECIAL_MEDICAL_LABEL, parseMilkCsv } from './csv';

const header = '品牌,产品名,段位,蛋白类型,版本,注册号,OPO,乳铁蛋白,益生菌,DHA/ARA,含蔗糖,含香精';

describe('parseMilkCsv', () => {
  it('解析合法行：中文枚举映射、成分「是」转 true、默认国行', () => {
    const { rows, errors } = parseMilkCsv(
      `${header}\n爱他美,卓萃幼儿配方奶粉,3,整蛋白,,YP2024000000,是,否,,是,,否`,
    );
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      brand: '爱他美',
      name: '卓萃幼儿配方奶粉',
      stage: 3,
      protein_type: 'intact',
      region: 'domestic',
      reg_no: 'YP2024000000',
      ingredients: { OPO: true, 'DHA/ARA': true },
    });
  });

  it('海外版本映射 overseas，注册号留空为 null', () => {
    const { rows, errors } = parseMilkCsv(`${header}\nAptamil,Essensis,2,部分水解,海外,,,,,,`);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({
      region: 'overseas',
      reg_no: null,
      protein_type: 'partially_hydrolyzed',
    });
  });

  it('TY 注册号自动加特医标记（FR-C6 强提示来源）', () => {
    const { rows } = parseMilkCsv(
      `${header}\n纽康特,深度无乳糖配方,1,深度水解,国行,TY2024000001,,,,,,`,
    );
    expect(rows[0]?.ingredients).toMatchObject({ [SPECIAL_MEDICAL_LABEL]: true });
  });

  it('缺品牌/产品名、段位越界、蛋白类型非法分别报错并跳过该行', () => {
    const { rows, errors } = parseMilkCsv(
      [
        header,
        ',缺品牌,1,整蛋白,,,,,,,',
        'B,缺段位,9,整蛋白,,,,,,,',
        'C,非法蛋白,1,水解,,,,,,,',
      ].join('\n'),
    );
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(3);
    expect(errors[0]).toContain('品牌与产品名为必填');
    expect(errors[1]).toContain('段位须为 1–4');
    expect(errors[2]).toContain('蛋白类型');
  });

  it('空行被跳过，不产生错误', () => {
    const { rows, errors } = parseMilkCsv(`${header}\n\nX,Y,1,整蛋白,国行,,,,,,\n`);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
  });
});
