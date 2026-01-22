import { SYSTEM_INSTRUCTION } from "../constants";

// --- API KEY MANAGEMENT ---
// Se estas chaves estiverem revogadas, o sistema falhará. 
// Para produção real, use variáveis de ambiente.
const API_KEYS = [
  "AIzaSyDHsKZv9zk5VN9tlqZ9Ffhl294i-BunRD0",
  "AIzaSyAdmzKq5c0PVqur7WygvyblnfsBY8e1rzE",
  "AIzaSyDlazOs2TixDhZrvP9pKZ2F23aABhnhDnw"
];

const MODEL_ID = "gemini-1.5-flash";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent`;

let currentKeyIndex = 0;

// --- INTERNAL HELPERS ---

const rotateKey = () => {
  currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
  console.log(`[System] Rotating API Key to index: ${currentKeyIndex}`);
};

const getCurrentKey = () => API_KEYS[currentKeyIndex];

/**
 * Simplified Fetch Implementation
 * Removed complex config objects to prevent "400 Bad Request" errors.
 * System instructions are now injected into the prompt text (Prompt Engineering) rather than API config.
 */
const callGeminiSimple = async (finalPrompt: string, imagePart?: { mimeType: string; data: string }): Promise<string> => {
  let attempts = 0;
  const maxAttempts = API_KEYS.length;

  while (attempts < maxAttempts) {
    const key = getCurrentKey();
    
    // Construct simplified payload
    const requestBody: any = {
      contents: [{
        parts: [
          { text: finalPrompt }
        ]
      }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 800
      }
    };

    // Add image if exists
    if (imagePart) {
      requestBody.contents[0].parts.push({
        inline_data: {
          mime_type: imagePart.mimeType,
          data: imagePart.data
        }
      });
    }

    try {
      const response = await fetch(`${API_URL}?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.error(`API Error (Key ${currentKeyIndex}):`, response.status, errorData);
        
        // Throw to trigger catch block and rotation
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      
      // Safety check fallback
      if (data.promptFeedback?.blockReason) {
        return "⚠️ Mensagem bloqueada pelos filtros de segurança do Google. Tente ser menos explícito.";
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!text) {
         throw new Error("Resposta vazia da IA.");
      }

      return text;

    } catch (error) {
      console.warn(`Tentativa ${attempts + 1} falhou.`);
      attempts++;
      rotateKey();
      // Pequeno delay para evitar spam
      await new Promise(r => setTimeout(r, 500));
    }
  }

  throw new Error("Todas as chaves falharam.");
};

// --- PUBLIC METHODS ---

export const sendMessageToGemini = async (
  message: string,
  imagePart?: { mimeType: string; data: string }
): Promise<string> => {
  
  // ESTRATÉGIA BLINDADA:
  // Injetamos a instrução do sistema no topo da mensagem do usuário.
  // Isso evita erros de compatibilidade da API com o campo "system_instruction".
  const fullPrompt = `${SYSTEM_INSTRUCTION}\n\n---\n\nUSUÁRIO: ${message}\n\nMENTOR:`;

  try {
    return await callGeminiSimple(fullPrompt, imagePart);
  } catch (e) {
    console.error("Critical Failure:", e);
    return "ERRO DE CONEXÃO: Verifique se as chaves de API são válidas e se você tem internet. O sistema não conseguiu conectar aos servidores do Google.";
  }
};

export const generateMindMapText = async (topic: string): Promise<string | null> => {
  const prompt = `
    ATUE COMO UM ESTRATEGISTA DE ELITE.
    Crie um Mapa Mental hierárquico (formato de texto identado) para resolver esta confusão: "${topic}".
    
    REGRAS:
    1. Use apenas texto puro.
    2. Use hierarquia com marcadores (-, *, +).
    3. Seja brutalmente prático. Nada de teoria. Apenas ações.
    
    Retorne APENAS o mapa.
  `;

  try {
    return await callGeminiSimple(prompt);
  } catch (error) {
    return null;
  }
};