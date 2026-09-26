from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from routers import upload, generate, feedback, summary, classroom, insights, roadmap

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router)
app.include_router(generate.router)
app.include_router(feedback.router)
app.include_router(summary.router)
app.include_router(classroom.router)
app.include_router(insights.router)
app.include_router(roadmap.router)

@app.get("/")
def root():
    return {"status": "ok"}
