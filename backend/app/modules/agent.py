import json

from langchain_core.prompts import PromptTemplate
from langchain_ollama import OllamaLLM

class LlamaAgent:
    def __init__(self):
        self.llm = OllamaLLM(model="llama3.2")

    def _build_prompt(self, routes_data, user_profile, gases):
        prompt_template = """
        You are a friendly, empathetic, and helpful AI routing assistant.
        User Profile: {profile}
        Gas Concentrations: {gases}
        Routes Data: {routes}
        
        CRITICAL: If respiratory_issue is true, you MUST choose the route with the ABSOLUTE LOWEST pollution_penalty, REGARDLESS of any other factors. We are prioritizing air health above everything else.
        If only low_eyesight is true, prioritize low complexity_penalty.
        
        Write exactly ONE short, engaging sentence explaining WHY you chose the cleanest air route for this user. Mention the specific PM2.5 numbers of this cleanest route. Do NOT return JSON. Keep it under 25 words.
        """
        prompt = PromptTemplate(template=prompt_template, input_variables=["profile", "gases", "routes"])
        return prompt, {
            "profile": json.dumps(user_profile),
            "gases": json.dumps(gases),
            "routes": json.dumps(routes_data)
        }

    def stream_reasoning(self, routes_data: list, user_profile: dict, gases: dict):
        """Generator that yields text chunks as the LLM streams them."""
        prompt, inputs = self._build_prompt(routes_data, user_profile, gases)
        chain = prompt | self.llm
        
        for chunk in chain.stream(inputs):
            yield chunk

    def evaluate_and_reason(self, routes_data: list, user_profile: dict, gases: dict) -> dict:
        """Non-streaming fallback."""
        prompt, inputs = self._build_prompt(routes_data, user_profile, gases)
        chain = prompt | self.llm
        
        response = chain.invoke(inputs)
        
        try:
            cleaned = response.strip().replace("```json", "").replace("```", "")
            parsed = json.loads(cleaned)
            return parsed
        except:
            sorted_routes = sorted(routes_data, key=lambda x: x['total_penalty'])
            return {
                "best_route_index": sorted_routes[0]["route_index"],
                "ai_reasoning": response.strip() if response.strip() else "I've selected the route with the lowest pollution levels for your safety."
            }