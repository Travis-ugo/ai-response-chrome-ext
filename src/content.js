import './injected_styles.css';
import './button.css';

// Global state for selection UI
let activeTrigger = null;
let activeMenu = null;
let lastSelectedText = "";
let lastSelectionRect = null;
let activeTextarea = null;

// Icons for the menu
const ICONS = {
  fix: "✨",
  rewrite: "🔄",
  pro: "💼",
  friendly: "😊",
  expand: "➕",
  shorten: "➖",
  translate: "🌐",
  explain: "🧠",
  bulb: "💡"
};

// --- Utility: Extract Client Name from Codementor ---
function getClientName() {
  // Common Codementor selectors for the requester's name
  const nameSelectors = [
    'div.author-name', 
    'div.name', 
    'h3.name', 
    'a.name',
    '.request-detail-view .author-info .name'
  ];
  
  for (const selector of nameSelectors) {
    const el = document.querySelector(selector);
    if (el && el.innerText.trim()) {
      return el.innerText.trim();
    }
  }
  return null;
}

// --- Selection Handling ---

document.addEventListener("mouseup", handleSelectionChange);
document.addEventListener("mousedown", (e) => {
  if (activeMenu && !activeMenu.contains(e.target) && !activeTrigger?.contains(e.target)) {
    removeSelectionUI();
  }
});

function handleSelectionChange(e) {
  const selection = window.getSelection();
  const text = selection.toString().trim();
  const target = e.target;
  
  // Check if we are in an editable area (textarea, input, or contenteditable)
  const isEditable = target.tagName === "TEXTAREA" || 
                     (target.tagName === "INPUT" && target.type === "text") ||
                     target.getAttribute('contenteditable') === 'true' ||
                     target.closest('[contenteditable="true"]');

  if (text.length > 0 && isEditable && selection.rangeCount > 0) {
    lastSelectedText = text;
    activeTextarea = target;
    
    const range = selection.getRangeAt(0);
    lastSelectionRect = range.getBoundingClientRect();
    
    showTrigger(lastSelectionRect);
  }
}

function showTrigger(rect) {
  removeSelectionUI();

  const trigger = document.createElement("div");
  trigger.id = "ma-ai-trigger";
  trigger.innerHTML = ICONS.bulb;
  
  // High Z-index and Fixed positioning for maximum visibility
  const scrollTop = window.scrollY || document.documentElement.scrollTop;
  trigger.style.cssText = `
    position: absolute;
    z-index: 2147483647;
    left: ${rect.right + 5}px;
    top: ${rect.top + scrollTop - 35}px;
    display: flex;
  `;

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    showMenu(rect);
  });

  document.body.appendChild(trigger);
  activeTrigger = trigger;
}

function showMenu(rect) {
  if (activeMenu) return;

  const menu = document.createElement("div");
  menu.id = "ma-ai-menu";
  
  // Premium Header
  const header = document.createElement("div");
  header.style.cssText = "font-size: 10px; font-weight: 800; color: #027E6F; text-transform: uppercase; margin: 4px 8px 8px; display: flex; justify-content: space-between; align-items: center;";
  const name = getClientName();
  header.innerHTML = `<span>AI Mentor</span> <span style="background: #027E6F; color: white; padding: 2px 6px; border-radius: 4px; font-size: 8px;">${name ? 'FOR ' + name.toUpperCase() : 'PRO'}</span>`;
  menu.appendChild(header);

  const actions = [
    { id: "fix_grammar", label: "Fix Grammar & Spelling", icon: ICONS.fix },
    { id: "rewrite_clearer", label: "Rewrite (Clearer)", icon: ICONS.rewrite },
    { id: "tone_professional", label: "Professional Tone", icon: ICONS.pro },
    { id: "tone_friendly", label: "Friendly Tone", icon: ICONS.friendly },
    { divider: true },
    { id: "translate_en", label: "Translate to English", icon: ICONS.translate },
    { id: "expand", label: "Expand Text", icon: ICONS.expand },
    { id: "shorten", label: "Shorten Text", icon: ICONS.shorten },
  ];

  actions.forEach(action => {
    if (action.divider) {
      const div = document.createElement("div");
      div.className = "ma-menu-divider";
      menu.appendChild(div);
      return;
    }

    const item = document.createElement("div");
    item.className = "ma-menu-item";
    item.innerHTML = `<span>${action.icon}</span> <span>${action.label}</span>`;
    
    item.addEventListener("click", () => handleAiAction(action.id, item));
    menu.appendChild(item);
  });

  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  menu.style.cssText = `
    position: absolute;
    z-index: 2147483647;
    left: ${rect.left}px;
    top: ${rect.bottom + scrollTop + 10}px;
  `;

  document.body.appendChild(menu);
  activeMenu = menu;
  
  if (activeTrigger) activeTrigger.style.display = "none";
}

async function handleAiAction(actionType, menuItem) {
  menuItem.classList.add("loading");
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: "getAiResponse",
      text: lastSelectedText,
      actionType: actionType,
      context: { clientName: getClientName() }
    });

    if (response.success) {
      replaceSelectedText(response.data);
      removeSelectionUI();
    } else {
      alert(`AI Error: ${response.error}`);
    }
  } catch (err) {
    alert("Connection Error. Please ensure the extension is enabled.");
  } finally {
    menuItem.classList.remove("loading");
  }
}

function replaceSelectedText(newText) {
  if (!activeTextarea) return;

  // Handle standard inputs
  if (activeTextarea.tagName === "TEXTAREA" || activeTextarea.tagName === "INPUT") {
    const start = activeTextarea.selectionStart;
    const end = activeTextarea.selectionEnd;
    const oldVal = activeTextarea.value;
    activeTextarea.value = oldVal.substring(0, start) + newText + oldVal.substring(end);
    activeTextarea.dispatchEvent(new Event('input', { bubbles: true }));
    activeTextarea.setSelectionRange(start, start + newText.length);
  } else {
    // Handle contenteditable
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const textNode = document.createTextNode(newText);
      range.insertNode(textNode);
      // Move cursor to end of new text
      range.setStartAfter(textNode);
      range.setEndAfter(textNode);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }
  activeTextarea.focus();
}

function removeSelectionUI() {
  if (activeTrigger) { activeTrigger.remove(); activeTrigger = null; }
  if (activeMenu) { activeMenu.remove(); activeMenu = null; }
}

// --- Original "Auto-Answer" logic restored & updated for Groq ---

function createSuggestionButton(label) {
  const newButton = document.createElement("button");
  newButton.textContent = label;
  newButton.className = "ma-suggestion-btn";
  
  newButton.addEventListener("click", (event) => {
    event.preventDefault();
    const textField = document.querySelector("form textarea") || document.querySelector('[contenteditable="true"]');
    if (textField) {
      if (textField.tagName === "TEXTAREA" || textField.tagName === "INPUT") {
        textField.value = textField.value ? `${textField.value} ${label}` : label;
        textField.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        textField.innerText = textField.innerText ? `${textField.innerText} ${label}` : label;
      }
    }
  });

  return newButton;
}

async function fetchSuggestions(txt) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: "getAiResponse",
      text: txt,
      actionType: "auto_answer",
      context: { clientName: getClientName() }
    });
    return response;
  } catch (err) {
    return { success: false, error: "Connection to background failed." };
  }
}

// SPA Navigation Awareness
let lastHandledUrl = "";

const navigationWatcher = setInterval(() => {
  const currentUrl = window.location.href;
  const targetButton = document.querySelector("form button");
  const details = document.querySelector("div.question-detail") || document.querySelector(".request-detail-view");
  const existingContainer = document.getElementById("ma-suggestion-container");

  // If we navigation to a new request, or the container is missing on a valid page
  if (targetButton && details) {
    if (currentUrl !== lastHandledUrl || !existingContainer) {
      lastHandledUrl = currentUrl;
      
      // Cleanup old container if any
      if (existingContainer) existingContainer.remove();

      const container = document.createElement("div");
      container.id = "ma-suggestion-container";
      
      const loader = document.createElement("span");
      loader.textContent = "✨ Generating AI Suggestions...";
      loader.style.cssText = "font-size: 11px; color: #64748b; margin-left: 8px; font-style: italic;";
      container.appendChild(loader);
      
      targetButton.parentNode.insertBefore(container, targetButton);

      fetchSuggestions(details.innerText).then((response) => {
        // Double check we are still on the same request before rendering
        if (window.location.href !== currentUrl) return;

        container.innerHTML = ""; 
        if (response.success && response.data) {
          container.appendChild(createSuggestionButton(response.data));
        } else {
          const errorMsg = document.createElement("span");
          errorMsg.style.cssText = "font-size: 11px; color: #ef4444; margin-left: 8px; padding: 4px 8px; background: #fee2e2; border-radius: 4px;";
          errorMsg.textContent = `❌ AI Error: ${response.error || "Unknown failure"}`;
          container.appendChild(errorMsg);
        }
      });
    }
  }
}, 1000);
