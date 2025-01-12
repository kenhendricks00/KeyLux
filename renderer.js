// Add this debugging code right after your script tag in index.html
async function init() {
  console.log("Initializing app...");
  try {
    console.log("Checking electronAPI availability:", window.electronAPI);
    const transitions = await window.electronAPI.getTransitions();
    console.log("Received transitions:", transitions);

    currentSettings = transitions;
    console.log("Current settings set to:", currentSettings);

    renderSettings();
    console.log("Render complete");
  } catch (error) {
    console.error("Initialization failed:", error);
  }
}

function renderSettings() {
  console.log("Starting render with settings:", currentSettings);
  const transitionsDiv = document.getElementById("transitions");
  if (!transitionsDiv) {
    console.error("Transitions div not found!");
    return;
  }

  if (!currentSettings) {
    console.error("No current settings available!");
    return;
  }

  const html = Object.entries(currentSettings)
    .map(([period, settings]) => {
      console.log(`Rendering section for ${period}:`, settings);
      return createTransitionSection(period, settings);
    })
    .join("");

  console.log("Generated HTML:", html);
  transitionsDiv.innerHTML = html;
}

// Add event listeners
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM loaded, initializing...");
  init();

  const saveButton = document.getElementById("saveButton");
  const resetButton = document.getElementById("resetButton");

  if (saveButton) {
    saveButton.addEventListener("click", saveSettings);
  } else {
    console.error("Save button not found!");
  }

  if (resetButton) {
    resetButton.addEventListener("click", resetDefaults);
  } else {
    console.error("Reset button not found!");
  }
});
