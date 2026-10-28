const imageInput = document.querySelector("#image-input");
const dropzone = document.querySelector("#dropzone");
const emptyState = document.querySelector("#empty-state");
const previewState = document.querySelector("#preview-state");
const imagePreview = document.querySelector("#image-preview");
const imageMeta = document.querySelector("#image-meta");
const fileName = document.querySelector("#file-name");
const analyzeButton = document.querySelector("#analyze-button");
const modelName = document.querySelector("#model-name");
const resultStatus = document.querySelector("#result-status");
const resultEmpty = document.querySelector("#result-empty");
const loadingState = document.querySelector("#loading-state");
const description = document.querySelector("#description");
const errorBox = document.querySelector("#error-box");
const errorMessage = document.querySelector("#error-message");
const copyButton = document.querySelector("#copy-button");

let selectedImage = null;
let previewUrl = null;

function setSelectedImage(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showError("That file isn’t an image. Choose a JPG, PNG, WEBP, or another image format.");
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    showError("That image is larger than 20 MB. Choose a smaller image and try again.");
    return;
  }

  selectedImage = file;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  imagePreview.src = previewUrl;
  imagePreview.alt = `Preview of ${file.name}`;
  fileName.textContent = file.name;
  emptyState.hidden = true;
  previewState.hidden = false;
  imageMeta.hidden = false;
  analyzeButton.disabled = false;
  clearOutput();
  dropzone.classList.remove("dragging");
}

function clearOutput() {
  resultEmpty.hidden = false;
  loadingState.hidden = true;
  description.hidden = true;
  errorBox.hidden = true;
  copyButton.hidden = true;
  resultStatus.innerHTML = '<span class="status-dot"></span> READY WHEN YOU ARE';
}

function showError(message, title = "Couldn’t connect to Ollama") {
  resultEmpty.hidden = true;
  loadingState.hidden = true;
  description.hidden = true;
  errorBox.hidden = false;
  copyButton.hidden = true;
  errorMessage.textContent = message;
  document.querySelector("#error-title").textContent = title;
  resultStatus.innerHTML = '<span class="status-dot error-dot"></span> NEEDS ATTENTION';
}

async function analyzeImage() {
  if (!selectedImage) return;
  const model = modelName.value.trim();
  if (!model) {
    showError("Enter the name of an installed Ollama vision model.", "Choose a model");
    modelName.focus();
    return;
  }

  analyzeButton.disabled = true;
  resultEmpty.hidden = true;
  description.hidden = true;
  errorBox.hidden = true;
  loadingState.hidden = false;
  copyButton.hidden = true;
  resultStatus.innerHTML = '<span class="status-dot working-dot"></span> ANALYZING';

  try {
    const imageBase64 = await toBase64(selectedImage);
    const response = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [{
          role: "user",
          content: "Briefly describe the main subject, setting, and one or two notable details. Avoid guessing.",
          images: [imageBase64],
        }],
        think: false,
        keep_alive: "10m",
        options: { num_predict: 120 },
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`The model “${model}” was not found. Pull it with: ollama pull ${model}`);
      }
      throw new Error(data.error || `Ollama returned an error (${response.status}).`);
    }

    const text = data.message?.content?.trim();
    if (!text) {
      const hasThinkingOnly = Boolean(data.message?.thinking?.trim());
      if (hasThinkingOnly) {
        throw new Error("The model used its output limit on reasoning and did not return a description. Run `ollama pull qwen3-vl:2b-instruct`, then use qwen3-vl:2b-instruct in the model field.");
      }
      throw new Error("The model returned an empty description. Try again or choose another vision model.");
    }

    description.textContent = text;
    description.hidden = false;
    loadingState.hidden = true;
    copyButton.hidden = false;
    resultStatus.innerHTML = '<span class="status-dot success-dot"></span> DESCRIPTION READY';
  } catch (error) {
    const message = error instanceof TypeError
      ? "The browser couldn’t reach Ollama. Make sure it’s running at localhost:11434. Browser security settings may also block this page; if so, serve the page locally and allow its origin in OLLAMA_ORIGINS, then restart Ollama."
      : error.message;
    showError(message);
  } finally {
    analyzeButton.disabled = !selectedImage;
  }
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const readAsBase64 = (blob) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = () => reject(new Error("The image could not be read. Please choose it again."));
      reader.readAsDataURL(blob);
    };

    if (!window.createImageBitmap) {
      readAsBase64(file);
      return;
    }

    createImageBitmap(file).then((bitmap) => {
      const maxEdge = 1280;
      const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("The image could not be prepared. Please choose it again.");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      canvas.toBlob((blob) => {
        if (blob) readAsBase64(blob);
        else reject(new Error("The image could not be prepared. Please choose it again."));
      }, "image/jpeg", 0.84);
    }).catch(reject);
  });
}

imageInput.addEventListener("change", (event) => setSelectedImage(event.target.files[0]));
analyzeButton.addEventListener("click", analyzeImage);

document.querySelector("#remove-image").addEventListener("click", () => {
  selectedImage = null;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  imagePreview.removeAttribute("src");
  imageInput.value = "";
  emptyState.hidden = false;
  previewState.hidden = true;
  imageMeta.hidden = true;
  analyzeButton.disabled = true;
  clearOutput();
});

dropzone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    imageInput.click();
  }
});

for (const eventName of ["dragenter", "dragover"]) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("dragging");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    if (eventName === "drop") setSelectedImage(event.dataTransfer.files[0]);
    dropzone.classList.remove("dragging");
  });
}

copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(description.textContent);
    copyButton.innerHTML = 'Copied <span aria-hidden="true">✓</span>';
    window.setTimeout(() => { copyButton.innerHTML = 'Copy description <span aria-hidden="true">⧉</span>'; }, 1600);
  } catch {
    copyButton.textContent = "Copy unavailable";
  }
});
