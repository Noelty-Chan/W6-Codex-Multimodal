const analyzeButton = document.querySelector("#analyze-button");
const modelName = document.querySelector("#model-name");
const resultStatus = document.querySelector("#result-status");
const resultEmpty = document.querySelector("#result-empty");
const descriptionGrid = document.querySelector("#description-grid");
const loadingState = document.querySelector("#loading-state");
const errorBox = document.querySelector("#error-box");
const errorMessage = document.querySelector("#error-message");
const copyButton = document.querySelector("#copy-button");
const actionFeedback = document.querySelector("#action-feedback");
const selectedImages = [null, null];
const previewUrls = [null, null];

function slotElement(selector, index) {
  return document.querySelector(`[${selector}="${index}"]`);
}

function updateSelectionFeedback() {
  const count = selectedImages.filter(Boolean).length;
  analyzeButton.disabled = count !== 2;
  if (count === 0) {
    setFeedback("Select two images to get started.", "neutral");
  } else if (count === 1) {
    const missing = selectedImages[0] ? "Image 2" : "Image 1";
    setFeedback(`${missing} still needs to be selected.`, "neutral");
  } else {
    setFeedback("Both images are ready to analyze.", "ready");
  }
}

function setFeedback(message, state = "neutral") {
  actionFeedback.className = `action-feedback ${state}`;
  actionFeedback.querySelector("span:last-child").textContent = message;
}

function setSelectedImage(index, file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showError(`Image ${index + 1} is not an image file. Choose a JPG, PNG, WEBP, or another image format.`);
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    showError(`Image ${index + 1} is larger than 20 MB. Choose a smaller image and try again.`);
    return;
  }

  selectedImages[index] = file;
  if (previewUrls[index]) URL.revokeObjectURL(previewUrls[index]);
  previewUrls[index] = URL.createObjectURL(file);
  const image = slotElement("data-image", index);
  image.src = previewUrls[index];
  image.alt = `Preview of image ${index + 1}: ${file.name}`;
  slotElement("data-name", index).textContent = file.name;
  slotElement("data-empty", index).hidden = true;
  slotElement("data-preview", index).hidden = false;
  slotElement("data-meta", index).hidden = false;
  clearOutput();
  updateSelectionFeedback();
}

function clearOutput() {
  resultEmpty.hidden = false;
  descriptionGrid.hidden = true;
  loadingState.hidden = true;
  errorBox.hidden = true;
  copyButton.hidden = true;
  resultStatus.innerHTML = '<span class="status-dot"></span> READY WHEN YOU ARE';
  for (let index = 0; index < 2; index += 1) {
    slotElement("data-description", index).hidden = true;
    slotElement("data-description", index).textContent = "";
    slotElement("data-output-status", index).textContent = "Waiting";
    slotElement("data-output-status", index).className = "output-status";
  }
}

function showError(message, title = "Something went wrong") {
  resultEmpty.hidden = true;
  loadingState.hidden = true;
  descriptionGrid.hidden = true;
  errorBox.hidden = false;
  copyButton.hidden = true;
  errorMessage.textContent = message;
  document.querySelector("#error-title").textContent = title;
  resultStatus.innerHTML = '<span class="status-dot error-dot"></span> NEEDS ATTENTION';
  setFeedback(message, "error");
}

async function describeImage(file, index, model) {
  slotElement("data-output-status", index).textContent = "Preparing image…";
  const imageBase64 = await toBase64(file);
  slotElement("data-output-status", index).textContent = "Asking Ollama…";
  const response = await fetch("http://localhost:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [{
        role: "user",
        content: "Briefly describe the main subject, setting, and one or two notable details in this image. Avoid guessing.",
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
      throw new Error("The model used its output limit on reasoning and did not return a description. Pull qwen3-vl:2b-instruct and use that model.");
    }
    throw new Error("The model returned an empty description. Try again or choose another vision model.");
  }
  return text;
}

async function analyzeImages() {
  if (selectedImages.some((image) => !image)) {
    updateSelectionFeedback();
    return;
  }
  const model = modelName.value.trim();
  if (!model) {
    showError("Enter the name of an installed Ollama vision model.", "Choose a model");
    modelName.focus();
    return;
  }

  analyzeButton.disabled = true;
  resultEmpty.hidden = true;
  errorBox.hidden = true;
  loadingState.hidden = true;
  descriptionGrid.hidden = false;
  copyButton.hidden = true;
  resultStatus.innerHTML = '<span class="status-dot working-dot"></span> ANALYZING';

  try {
    for (let index = 0; index < 2; index += 1) {
      setFeedback(`AI is processing image ${index + 1} of 2…`, "processing");
      const text = await describeImage(selectedImages[index], index, model);
      const output = slotElement("data-description", index);
      output.textContent = text;
      output.hidden = false;
      slotElement("data-output-status", index).textContent = "Description ready";
      slotElement("data-output-status", index).classList.add("success-text");
    }
    resultStatus.innerHTML = '<span class="status-dot success-dot"></span> DESCRIPTIONS READY';
    setFeedback("Request successful. Both image descriptions are ready.", "success");
    copyButton.hidden = false;
  } catch (error) {
    const message = error instanceof TypeError
      ? "The browser couldn’t reach Ollama. Make sure it’s running at localhost:11434. Browser security settings may also block this page; if so, serve the page locally and allow its origin in OLLAMA_ORIGINS, then restart Ollama."
      : error.message;
    showError(message);
  } finally {
    analyzeButton.disabled = false;
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
      if (!context) {
        bitmap.close();
        throw new Error("The image could not be prepared. Please choose it again.");
      }
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

for (let index = 0; index < 2; index += 1) {
  const input = slotElement("data-input", index);
  const dropzone = slotElement("data-dropzone", index);
  input.addEventListener("change", (event) => setSelectedImage(index, event.target.files[0]));
  dropzone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      input.click();
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
      if (eventName === "drop") setSelectedImage(index, event.dataTransfer.files[0]);
      dropzone.classList.remove("dragging");
    });
  }
  slotElement("data-remove", index).addEventListener("click", () => {
    selectedImages[index] = null;
    if (previewUrls[index]) URL.revokeObjectURL(previewUrls[index]);
    previewUrls[index] = null;
    slotElement("data-image", index).removeAttribute("src");
    input.value = "";
    slotElement("data-empty", index).hidden = false;
    slotElement("data-preview", index).hidden = true;
    slotElement("data-meta", index).hidden = true;
    clearOutput();
    updateSelectionFeedback();
  });
}

analyzeButton.addEventListener("click", analyzeImages);
copyButton.addEventListener("click", async () => {
  const text = [0, 1].map((index) => {
    const output = slotElement("data-description", index);
    return `Image ${index + 1}:\n${output.textContent}`;
  }).join("\n\n");
  try {
    await navigator.clipboard.writeText(text);
    copyButton.innerHTML = 'Copied <span aria-hidden="true">✓</span>';
    window.setTimeout(() => { copyButton.innerHTML = 'Copy descriptions <span aria-hidden="true">⧉</span>'; }, 1600);
  } catch {
    copyButton.textContent = "Copy unavailable";
  }
});
