""" 
1. here we are creating a wrapper arounf Azure OpenAI SDK
2. centralizing client creation so that every LLM calling modules share the same configure client
"""
from openai import AzureOpenAI
from config.settings import settings

