// Custom environment variable declarations
// Ensures process.env variables are strongly typed

declare namespace NodeJS {
  interface ProcessEnv {
    AZURE_OPENAI_ENDPOINT?: string;
    AZURE_OPENAI_API_KEY?: string;
    AZURE_OPENAI_API_VERSION?: string;
    AZURE_OPENAI_DEPLOYMENT?: string;
    OPENAI_API_KEY?: string;
    OPENAI_MODEL?: string; // Used only for 'openai' provider; ignored for 'azure-openai'
    NODE_ENV?: 'development' | 'production' | 'test';
  }
}
