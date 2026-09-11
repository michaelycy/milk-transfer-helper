"""AI 输出安全护栏（FR-K1，纯函数 + 单测）。

NFR-1 原则「宁可保守」：护栏误伤时降级为固定安全文案，绝不放过越界输出。
本模块不做任何 I/O，供网关与测试直接调用。
"""
import re

# 用户输入中的高危症状词：命中即在回答前置固定就医提示（不拦截提问本身）
URGENT_INPUT_WORDS: tuple[str, ...] = (
    "血", "发烧", "发热", "高热", "抽搐", "惊厥", "脱水",
    "喷射性吐", "呕血", "精神差", "囟门凸起",
)
URGENT_NOTICE = "⚠️ 你提到的情况可能需要及时就医确认：如宝宝出现血便、持续发热、频繁呕吐、精神差等表现，请尽快前往医院，本工具不能替代医生。"

# 模型输出中的越界模式（诊断结论/用药/疗效承诺）：命中即整体替换为固定引导文案
RED_FLAG_OUTPUT_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(pattern) for pattern in (
        r"确诊(为|是)", r"诊断为", r"可以服用", r"建议服用", r"服用.{0,6}(药|剂)",
        r"处方", r"剂量", r"肌注|输液|抗生素",
        r"治愈|根治|药到病除", r"停掉(.{0,4})药",
    )
)
SAFE_FALLBACK_REPLY = (
    "这个问题涉及医学判断，我只能提供一般的喂养观察信息，不能给出诊断或用药建议。"
    "建议记录症状并通过复盘报告与医生沟通；如有疑虑请及时就医。"
)

# 出域话题（不做通用育儿百科）：直接返回固定引导，不调模型
OFF_DOMAIN_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(pattern) for pattern in (
        r"辅食|食谱", r"疫苗|接种", r"感冒|咳嗽|肺炎|手足口|轮状",
        r"早教|启蒙|英语", r"纸尿裤|尿布", r"睡眠训练|哄睡", r"产后|月子|减肥",
    )
)
OFF_DOMAIN_REPLY = (
    "这个问题超出了我的服务范围（转奶方法 · 奶粉知识 · 喂养观察）。"
    "你可以到「知识」栏目查看相关文章；涉及健康问题请咨询医生。"
)

# 免责声明（FR-K5：回答固定附带）
DISCLAIMER = "内容由 AI 生成，仅供参考，不构成医学建议。"


def contains_urgent_input(question: str) -> bool:
    """用户提问是否命中高危症状词（前置就医提示）。"""
    return any(word in question for word in URGENT_INPUT_WORDS)


def is_output_safe(text: str) -> bool:
    """模型输出是否通过红线护栏（含诊断/用药/疗效承诺即不安全）。"""
    return not any(pattern.search(text) for pattern in RED_FLAG_OUTPUT_PATTERNS)


def is_in_domain(question: str) -> bool:
    """提问是否属于限定域（转奶/奶粉/喂养观察）；出域问题不调模型。"""
    return not any(pattern.search(question) for pattern in OFF_DOMAIN_PATTERNS)


def wrap_answer(question: str, answer: str) -> dict[str, str | bool]:
    """输出管线：护栏校验 → 就医前置 → 免责声明。返回 (最终文本, 是否降级)。"""
    degraded = False
    if not is_output_safe(answer):
        answer = SAFE_FALLBACK_REPLY
        degraded = True
    if contains_urgent_input(question):
        answer = f"{URGENT_NOTICE}\n\n{answer}"
    return {"answer": f"{answer}\n\n— {DISCLAIMER}", "degraded": degraded}
