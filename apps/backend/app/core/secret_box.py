"""供应商密钥加密盒（FR-K6 密钥界面化存储，NFR-2）。

设计：
- 数据库存 AES-256-GCM 密文，主密钥（AI_KEY_MASTER_SECRET）仅存后端环境变量；
- 明文只在后端内存瞬时存在：解密即用、不落日志、不进任何响应；
- 密文带版本前缀（v1），支持未来轮换；nonce 每次加密随机生成；
- 主密钥未配置或密文损坏时 decrypt 返回 None，调用方回退环境变量约定路径。
"""
import base64
import binascii
import hashlib
import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_VERSION = b"v1"
_NONCE_LEN = 12


class SecretBox:
    def __init__(self, master_secret: str):
        if not master_secret or len(master_secret) < 16:
            raise ValueError("AI_KEY_MASTER_SECRET 未配置或长度不足 16 位")
        self._aes = AESGCM(hashlib.sha256(master_secret.encode()).digest())

    def encrypt(self, plaintext: str) -> str:
        nonce = os.urandom(_NONCE_LEN)
        ct = self._aes.encrypt(nonce, plaintext.encode(), associated_data=_VERSION)
        return "v1.{}.{}".format(
            base64.urlsafe_b64encode(nonce).decode().rstrip("="),
            base64.urlsafe_b64encode(ct).decode().rstrip("="),
        )

    def decrypt(self, token: str) -> str | None:
        """解密失败（格式/主密钥不匹配/被篡改）返回 None，由调用方降级。"""
        try:
            version, nonce_b64, ct_b64 = token.split(".", 2)
            if version.encode() != _VERSION:
                return None
            nonce = base64.urlsafe_b64decode(nonce_b64 + "=" * (-len(nonce_b64) % 4))
            ct = base64.urlsafe_b64decode(ct_b64 + "=" * (-len(ct_b64) % 4))
            return self._aes.decrypt(nonce, ct, associated_data=_VERSION).decode()
        except (InvalidTag, binascii.Error, ValueError, TypeError, UnicodeDecodeError):
            # 密文格式损坏 / 被篡改（InvalidTag）/ 主密钥不匹配：一律回退环境变量路径
            return None


def mask_key(plaintext: str) -> str:
    """掩码展示：仅露出末 4 位，任何场景不得返回完整明文。"""
    tail = plaintext[-4:] if len(plaintext) >= 4 else "*" * len(plaintext)
    return f"****{tail}"


def get_master_secret() -> str:
    from app.core.config import get_settings

    return getattr(get_settings(), "ai_key_master_secret", "")


def try_decrypt_stored(token: str | None) -> str | None:
    """便捷入口：无主密钥/无密文时返回 None（调用方回退环境变量路径）。"""
    if not token:
        return None
    secret = get_master_secret()
    if not secret:
        return None
    try:
        return SecretBox(secret).decrypt(token)
    except ValueError:
        return None
