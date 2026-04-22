chrome.runtime.onInstalled.addListener(() => {
  console.log("MentorAssistance AI Extension Installed");
});

// Default model for Groq
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

async function getApiKey() {
  const result = await chrome.storage.sync.get("groq_api_key");
  return result.groq_api_key || import.meta.env.VITE_GROQ_API_KEY;
}

const SYSTEM_PROMPTS = {
  auto_answer: "You are a helpful mentor on the codementor platform. Your goal is to briefly propose that you'd like to assist with the user's problem. Answer requests by showing you can help and are knowledgeable. Keep it friendly, sound human, and give a tiny clue of how you'd solve it without technical details. CRITICAL: Limit your response to a MAXIMUM of 300 characters. Answering style: concise and professional like Mike Weinberg. Personalization: If a client name is provided, start with 'Hi [ClientName],'. STRIKE RULES: Plain text ONLY. NO markdown, NO asterisks, NO bolding.",
  fix_grammar: "Fix all grammar/spelling errors. Return ONLY the plain text without any markdown or asterisks.",
  rewrite_clearer: "Rewrite to be more clear and professional. Return ONLY plain text without any markdown or asterisks.",
  tone_professional: "Adjust to a professional/formal tone. Return ONLY plain text without any markdown or asterisks.",
  tone_friendly: "Adjust to a friendly/warm tone. Return ONLY plain text without any markdown or asterisks.",
  expand: "Expand on these points with more detail. Return ONLY plain text without any markdown or asterisks.",
  shorten: "Shorten this text to its essence. Return ONLY plain text without any markdown or asterisks.",
  translate_en: "Translate or refine to natural English. Return ONLY plain text without any markdown or asterisks."
};

async function callGroq(text, actionType) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error("Groq API Key not found. Please set it in the extension popup.");
  }

  const systemPrompt = SYSTEM_PROMPTS[actionType] || SYSTEM_PROMPTS.auto_answer;
  const url = "https://api.groq.com/openai/v1/chat/completions";

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Text to process:\n${text}` }
        ],
        temperature: 0.85,
        max_tokens: 1024,
        top_p: 1,
        stream: false
      })
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error("Rate limit exceeded on Groq. Please wait a moment.");
      }
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Groq API Error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error("Received an empty response from Groq.");
    }

    let rawText = data.choices[0].message.content.trim();

    // Programmatic Safety Net: Strip all asterisks
    const cleanText = rawText.replace(/\*/g, '').replace(/^- /gm, '').trim();

    return cleanText;
  } catch (err) {
    console.error("Groq Fetch Error:", err);
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

    callGroq(finalPrompt, actionType)
      .then((data) => {
        sendResponse({ success: true, data });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep message channel open for async response
  }
});
