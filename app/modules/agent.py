import json
from langchain_community.llms import Ollama
from langchain_core.prompts import PromptTemplate
from langchain_ollama import OllamaLLM
class LlamaAgent:
    def __init__(self):
        self.llm = Ollama(model="llama3.1", format="json")

    def evaluate_and_reason(self, routes_data: list, user_profile: dict, gases: dict) -> dict:
        prompt_template = """
        You are a friendly, empathetic, and helpful AI routing assistant.
        User Profile: {profile}
        Gas Concentrations: {gases}
        Routes Data: {routes}
        
        Select the best route_index based on the user profile. If respiratory_issue is true, prioritize low pollution_penalty. If low_eyesight is true, prioritize low complexity_penalty.
        
        You MUST return ONLY a valid JSON object with exactly two keys: "best_route_index" (integer) and "ai_reasoning" (string). Do not include any other text before or after the JSON.
        
        Make the "ai_reasoning" string engaging, conversational, and empathetic to the user's specific needs (e.g., mentioning their respiratory or eyesight conditions if applicable, and how the chosen route helps them). Keep it concise but friendly!
        """
        prompt = PromptTemplate(template=prompt_template, input_variables=["profile", "gases", "routes"])
        chain = prompt | self.llm
        
        response = chain.invoke({
            "profile": json.dumps(user_profile),
            "gases": json.dumps(gases),
            "routes": json.dumps(routes_data)
        })
        
        try:
            cleaned = response.strip().replace("```json", "").replace("```", "")
            return json.loads(cleaned)
        except:
            sorted_routes = sorted(routes_data, key=lambda x: x['total_penalty'])
            return {
                "best_route_index": sorted_routes[0]["route_index"],
                "ai_reasoning": "I've selected the safest and most efficient route for you based on current conditions. Have a great trip!"
            }