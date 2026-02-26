from pydantic import BaseModel
from typing import List, Dict, Any

class UserProfile(BaseModel):
    respiratory_issue: bool
    low_eyesight: bool

class RouteRequest(BaseModel):
    routes: List[Any]
    user_profile: UserProfile

class RouteScore(BaseModel):
    route_index: int
    pollution_penalty: float
    complexity_penalty: float
    total_penalty: float

class RouteResponse(BaseModel):
    best_route_index: int
    ai_reasoning: str
    gas_concentrations: Dict[str, float]
    route_scores: List[RouteScore]