// The left side of the page: where the skill comes in and the Scan button lives.

const REPO_PATTERN =
  /^(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$|^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const FILE_PROMPT = "Drop a .md or .txt file here, or click to choose one";

/**
 * @param {HTMLElement} root the [data-skill-panel] element
 * @param {{onScan: () => void, onClear: () => void}} handlers
 */
export function createInputPanel(root, { onScan, onClear }) {
  const $ = (selector) => root.querySelector(selector);
  const textarea = $("[data-text]");
  const repoInput = $("[data-repo]");
  const fileInput = $("[data-file]");
  const fileLabel = $("[data-file-label]");
  const dropzone = $("[data-dropzone]");
  const scanButton = $("[data-scan]");
  const errorBox = $("[data-error]");
  const infoBox = $("[data-info]");
  let activeTab = "paste";

  // ---------- tabs ----------
  const tabs = [...root.querySelectorAll("[data-tab]")];
  tabs.forEach((tab) => tab.addEventListener("click", () => selectTab(tab.dataset.tab)));

  function selectTab(name) {
    activeTab = name;
    tabs.forEach((tab) => {
      const on = tab.dataset.tab === name;
      tab.classList.toggle("is-active", on);
      tab.setAttribute("aria-selected", String(on));
    });
    root.querySelectorAll("[data-panel]").forEach((panel) => (panel.hidden = panel.dataset.panel !== name));
  }

  // ---------- file drop ----------
  fileInput.addEventListener("change", () => {
    fileLabel.textContent = fileInput.files[0] ? fileInput.files[0].name : FILE_PROMPT;
  });
  ["dragenter", "dragover"].forEach((type) =>
    dropzone.addEventListener(type, (e) => {
      e.preventDefault();
      dropzone.classList.add("is-dragover");
    })
  );
  ["dragleave", "drop"].forEach((type) => dropzone.addEventListener(type, () => dropzone.classList.remove("is-dragover")));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) {
      fileInput.files = e.dataTransfer.files;
      fileInput.dispatchEvent(new Event("change"));
    }
  });

  // ---------- buttons ----------
  scanButton.addEventListener("click", onScan);
  $("[data-clear]").addEventListener("click", () => {
    textarea.value = "";
    repoInput.value = "";
    fileInput.value = "";
    fileLabel.textContent = FILE_PROMPT;
    selectTab("paste");
    clearMessages();
    onClear();
  });

  function showMessage(box, text) {
    box.textContent = text;
    box.hidden = false;
  }

  function clearMessages() {
    errorBox.hidden = true;
    infoBox.hidden = true;
  }

  return {
    /**
     * Read what the user entered.
     * @returns {Promise<{error: string} | {input: object, source: {type: string, text: string | null}}>}
     *   `source` is what Changes can edit: the skill's text, or null for a repo.
     */
    async read() {
      if (activeTab === "upload") {
        const file = fileInput.files[0];
        if (!file) return { error: "Choose a .md or .txt file to scan." };
        return { input: { type: "upload", file }, source: { type: "upload", text: await file.text() } };
      }

      if (activeTab === "github") {
        const text = repoInput.value.trim();
        if (!text) return { error: "Enter a GitHub repo link or user/repo first." };
        if (!REPO_PATTERN.test(text)) {
          return { error: "That doesn't look like a GitHub repo. Try github.com/user/repo or user/repo." };
        }
        return { input: { type: "github", text }, source: { type: "github", text: null } };
      }

      const text = textarea.value.trim();
      if (!text) return { error: "Paste your skill code first." };
      return { input: { type: "paste", text }, source: { type: "paste", text: textarea.value } };
    },

    /** Put edited text back in the Paste tab (used by Changes). */
    setSkillText(text) {
      textarea.value = text;
      selectTab("paste");
    },

    setBusy(busy) {
      scanButton.disabled = busy;
      scanButton.textContent = busy ? "Scanning..." : "Scan";
    },

    showError: (text) => {
      infoBox.hidden = true;
      showMessage(errorBox, text);
    },
    showInfo: (text) => {
      errorBox.hidden = true;
      showMessage(infoBox, text);
    },
    clearMessages,
  };
}
