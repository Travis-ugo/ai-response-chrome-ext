chrome.runtime.onInstalled.addListener(() => {
  console.log("MentorAssistance AI Extension Installed");
});

// Default placeholders - using latest alias for compatibility
const DEFAULT_MODEL = "gemini-flash-latest";

async function getApiKey() {
  const result = await chrome.storage.sync.get("gemini_api_key");
  return result.gemini_api_key || import.meta.env.VITE_GEMINI_API_KEY;
}

const SYSTEM_PROMPTS = {
  auto_answer: "You are a helpful mentor on the codementor platform, and a senior software engineer experienced in cloud, platform and management. You assist people by responding to their requests and getting on one on one calls to help and guide them. Answer requests by showing that you can help them and that you are knowledgeable about the topic. Keep your responses friendly, sound human, and give a clue of how you would solve the problem without spilling the solution; the aim is to get a response and get on a call so you can help better and accurately. Answer questions in 100 words or less (TARGET: 500-600 characters). Answering style similar to Mike Weinberg. Personalization: If a client name is provided, ALWAYS start with 'Hi [ClientName],'. STRIKE RULES: Return ONLY plain text. NO markdown, NO asterisks (*), NO bolding.",
  fix_grammar: "Fix all grammar/spelling errors. Return ONLY the plain text without any markdown or asterisks.",
  rewrite_clearer: "Rewrite to be more clear and professional. Return ONLY plain text without any markdown or asterisks.",
  tone_professional: "Adjust to a professional/formal tone. Return ONLY plain text without any markdown or asterisks.",
  tone_friendly: "Adjust to a friendly/warm tone. Return ONLY plain text without any markdown or asterisks.",
  expand: "Expand on these points with more detail. Return ONLY plain text without any markdown or asterisks.",
  shorten: "Shorten this text to its essence. Return ONLY plain text without any markdown or asterisks.",
  translate_en: "Translate or refine to natural English. Return ONLY plain text without any markdown or asterisks."
};

async function callGemini(text, actionType) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error("Gemini API Key not found. Please set it in the extension popup.");
  }

  const systemPrompt = SYSTEM_PROMPTS[actionType] || SYSTEM_PROMPTS.auto_answer;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `${systemPrompt}\n\nText to process:\n${text}` }]
        }],
        generationConfig: {
          temperature: 0.85,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
        }
      })
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error("Rate limit exceeded. Please wait a moment before trying again.");
      }
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `API Error: ${response.status}`);
    }

    const data = await response.json();

    // Check if the response actually contains content
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts) {
      // Check for blocked content
      if (data.candidates && data.candidates[0]?.finishReason === "SAFETY") {
        throw new Error("The AI declined to process this text for safety reasons.");
      }
      throw new Error("Received an empty response from the AI.");
    }

    let rawText = data.candidates[0].content.parts[0].text.trim();

    // Programmatic Safety Net: Strip all asterisks and bullet points
    // This ensures that even if Gemini ignores the prompt guidelines, the output is clean.
    const cleanText = rawText.replace(/\*/g, '').replace(/^- /gm, '').trim();

    return cleanText;
  } catch (err) {
    console.error("Gemini Fetch Error:", err);
    throw err;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getAiResponse") {
    const { text, actionType, context } = message;

    if (!text) {
      sendResponse({ success: false, error: "No text provided for processing." });
      return;
    }

    // Build the final prompt with context if available
    let finalPrompt = text;
    if (context && context.clientName) {
      finalPrompt = `Client Name: ${context.clientName}\n\n${text}`;
    }

    callGemini(finalPrompt, actionType)
      .then((data) => {
        sendResponse({ success: true, data });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep message channel open for async response
  }
});
