# 99 · 附录（术语表 · 追溯矩阵 · 旧文档关系）

| 元素 | 内容 |
|---|---|
| 文档状态 | 草案（随 v2.0-draft2 拆分） |
| 上游文档 | [README.md](README.md) |

## 1. 术语表

术语与系统语义（喂养日、顿次、状态机、指标口径、事件清单等）已统一提取至 [00-glossary.md](00-glossary.md)——**唯一来源**，本节不再重复维护。设计新功能时先查 glossary，缺概念先补 glossary 再写 FR（README §2.7）。

## 2. 需求追溯矩阵（痛点 → 需求 → 闭环 → 指标 → UI）

| 痛点 | 承接 FR | 闭环 | 验证指标 | UI 画板（V2 系列） |
|---|---|---|---|---|
| Q1 怎么转奶 | C1–C7、I1、E2/C5、A4（触发） | L1 | 计划完成率、计划创建率 | V2-01~05、08 |
| Q2 怎么记录 | A1–A3、D1–D5、E1–E3、F1–F3 | L1/L2 | 7 日打卡留存、记录成本 P95 | V2-06、07、09、13 |
| Q3 怎么选奶粉 | B1–B4、G1–G3 | L3 | 推荐采纳率、（M3 后）问卷完成率 | V2-10、11 |
| （账户地基） | H0–H3 | 全部 | 次日留存（护栏） | V2-12、13 |
| （度量地基） | H4 | 全部 | glossary §5 全部指标 | — |
| （增长） | F2 分享、G3 入口 | L4 | 分享归因新增 | V2-09 |

## 3. 旧文档关系

| 文档 | 处置 |
|---|---|
| `docs/PRD.md`（v2.0-draft1 单文件版） | **已删除**，内容拆分为本目录（docs/spec/），以 README 索引为准 |
| `.trae/documents/baby-milk-transfer-prd.md`（v1） | 仅存档参考，被本目录取代 |
| `.trae/documents/baby-milk-transfer-tech-arch.md` | 继续有效，须随每个里程碑更新（新增表、Edge Function、提醒通道设计） |
| `supabase/migrations/20240523000000_init_schema.sql` | 基线 schema，后续一律增量迁移，不重写（规范见 03-data-model §4） |
