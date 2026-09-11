"""FastAPI 应用入口：健康检查 + 鉴权 + 数据透传。"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import ai as ai_api
from app.api import auth as auth_api
from app.api import data as data_api

app = FastAPI(title="转奶日记 API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_api.router)
app.include_router(data_api.router)
app.include_router(ai_api.router)


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}
