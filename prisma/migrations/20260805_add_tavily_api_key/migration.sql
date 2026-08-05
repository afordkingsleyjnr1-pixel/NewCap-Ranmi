-- Add Tavily API key field to app_settings
ALTER TABLE "app_settings" ADD COLUMN "tavily_api_key_encrypted" TEXT;
