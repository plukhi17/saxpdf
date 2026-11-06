(() => {
  "use strict";
  const $ = (selector) => document.querySelector(selector);
  const dropzone = $("#dropzone");
  const fileInput = $("#fileInput");
  const fileList = $("#fileList");
  const modeSelect = $("#compressionMode");
  const targetOptions = $("#targetOptions");
  const targetSelect = $("#targetSize");
  const customTarget = $("#customTarget");
  const customSize = $("#customSize");
  const runButton = $("#runBtn");
  const clearButton = $("#clearBtn");
  const anotherButton = $("#anotherBtn");
  const uploadError = $("#uploadError");
  const status = $("#status");
  const progressWrap = $("#progressWrap");
  const progressBar = $("#progressBar");
  const progressStatus = $("#progressStatus");
  const progressPercent = $("#progressPercent");
  const results = $("#results");
  const menuToggle = $("#menuToggle");
  const files = [];
  const resultUrls = [];
  let processing = false;
  let inspecting = false;
  let processedCount = 0;
  const workerUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const formatBytes = (size) => size < 1024 ? `${size} B` : size < 1048576 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1048576).toFixed(2)} MB`;
  const safeName = (name) => name.replace(/\.pdf$/i, "").replace(/[^a-z0-9_-]+/gi, "_").slice(0, 60) || "document";

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle("error", isError);
  }

  function clearResults() {
    resultUrls.forEach((url) => URL.revokeObjectURL(url));
    resultUrls.length = 0;
    results.replaceChildren();
  }

  function updateButtons() {
    runButton.disabled = processing || inspecting || files.length === 0;
    clearButton.disabled = processing || inspecting || files.length === 0;
    fileInput.disabled = processing || inspecting;
    runButton.innerHTML = processing ? "Compressing…" : inspecting ? "Checking PDFs…" : files.length ? `Compress ${files.length} PDF${files.length === 1 ? "" : "s"} <span>→</span>` : "Choose files first <span>→</span>";
    fileList.querySelectorAll("button").forEach((button) => { button.disabled = processing || inspecting; });
  }

  function renderFiles() {
    fileList.replaceChildren();
    files.forEach((entry, index) => {
      const row = document.createElement("div");
      row.className = "file-row";
      const icon = document.createElement("span");
      icon.className = "mini-pdf";
      icon.textContent = "PDF";
      const info = document.createElement("div");
      info.className = "file-info";
      const name = document.createElement("b");
      name.textContent = entry.file.name;
      const metadata = document.createElement("small");
      metadata.textContent = `${formatBytes(entry.file.size)} · ${entry.pages === null ? "Checking pages…" : `${entry.pages} page${entry.pages === 1 ? "" : "s"}`}`;
      info.append(name, metadata);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove-file";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", `Remove ${entry.file.name}`);
      remove.addEventListener("click", () => {
        if (processing || inspecting) return;
        files.splice(index, 1);
        clearResults();
        progressWrap.classList.add("hidden");
        anotherButton.classList.add("hidden");
        setStatus("");
        renderFiles();
        updateButtons();
      });
      row.append(icon, info, remove);
      fileList.append(row);
    });
    updateButtons();
  }

  function showError(message) {
    uploadError.textContent = message;
  }

  async function inspectPdf(file) {
    const header = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
    const signature = new TextDecoder().decode(header);
    if (!signature.includes("%PDF-")) throw new Error("This file does not appear to be a valid PDF.");
    if (!window.pdfjsLib) throw new Error("The PDF reader could not load. Check your internet connection and reload.");
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
    const task = pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    try {
      const pdf = await task.promise;
      const pageCount = pdf.numPages;
      await pdf.destroy();
      return pageCount;
    } catch (error) {
      await task.destroy();
      if (error?.name === "PasswordException") throw new Error("Password-protected PDFs are not supported. Remove the password with permission and try again.");
      throw new Error("This PDF could not be opened. It may be damaged or use an unsupported format.");
    }
  }

  async function acceptFiles(fileCollection) {
    if (processing || inspecting) return;
    const selected = Array.from(fileCollection);
    uploadError.textContent = "";
    const invalid = selected.filter((file) => file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf"));
    if (invalid.length) {
      showError("Please choose PDF files only. Unsupported files were not added.");
      return;
    }
    const uniqueFiles = selected.filter((file) => !files.some((entry) => entry.file.name === file.name && entry.file.size === file.size && entry.file.lastModified === file.lastModified));
    if (!uniqueFiles.length) {
      if (selected.length) showError("Those files are already in the list.");
      return;
    }
    uniqueFiles.forEach((file) => files.push({ file, pages: null }));
    inspecting = true;
    renderFiles();
    setStatus("");
    clearResults();
    progressWrap.classList.add("hidden");
    anotherButton.classList.add("hidden");
    try {
      for (const entry of files.filter((item) => item.pages === null)) {
        try {
          entry.pages = await inspectPdf(entry.file);
        } catch (error) {
          files.splice(files.indexOf(entry), 1);
          showError(`${entry.file.name}: ${error.message}`);
        }
        renderFiles();
      }
    } finally {
      inspecting = false;
      renderFiles();
    }
  }

  function targetBytes() {
    if (targetSelect.value !== "custom") return Number(targetSelect.value);
    const size = Number(customSize.value);
    if (!Number.isFinite(size) || size < 10 || size > 102400) throw new Error("Enter a custom target between 10 KB and 100 MB.");
    return Math.round(size * 1024);
  }

  function renderSettings() {
    targetOptions.classList.toggle("hidden", modeSelect.value !== "target");
    customTarget.classList.toggle("hidden", targetSelect.value !== "custom");
  }

  function compressionProfiles(mode) {
    if (mode === "low") return [{ scale: 1.5, quality: 0.9 }];
    if (mode === "high") return [{ scale: 0.9, quality: 0.5 }];
    if (mode === "target") return [
      { scale: 1.5, quality: 0.88 },
      { scale: 1.35, quality: 0.78 },
      { scale: 1.2, quality: 0.68 },
      { scale: 1.05, quality: 0.58 },
      { scale: 0.9, quality: 0.48 },
      { scale: 0.75, quality: 0.4 }
    ];
    return [{ scale: 1.25, quality: 0.76 }];
  }

  function progress(label, value) {
    const rounded = Math.max(0, Math.min(100, Math.round(value)));
    progressStatus.textContent = label;
    progressBar.value = rounded;
    progressPercent.textContent = `${rounded}%`;
  }

  async function createCompressedPdf(file, profile, fileIndex, totalFiles, profileIndex, profileCount, target) {
    const sourceTask = pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    let source;
    try {
      source = await sourceTask.promise;
      const output = await PDFLib.PDFDocument.create();
      for (let pageNumber = 1; pageNumber <= source.numPages; pageNumber++) {
        const page = await source.getPage(pageNumber);
        const originalViewport = page.getViewport({ scale: 1 });
        const areaLimitScale = Math.sqrt(16000000 / (originalViewport.width * originalViewport.height));
        const dimensionLimitScale = 4000 / Math.max(originalViewport.width, originalViewport.height);
        const scale = Math.min(profile.scale, areaLimitScale, dimensionLimitScale);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.ceil(viewport.width));
        canvas.height = Math.max(1, Math.ceil(viewport.height));
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Your browser could not allocate memory to render a page.");
        await page.render({ canvasContext: context, viewport }).promise;
        const imageBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", profile.quality));
        canvas.width = 0;
        canvas.height = 0;
        if (!imageBlob) throw new Error(`Could not compress page ${pageNumber}.`);
        const image = await output.embedJpg(await imageBlob.arrayBuffer());
        const outputPage = output.addPage([originalViewport.width, originalViewport.height]);
        outputPage.drawImage(image, { x: 0, y: 0, width: originalViewport.width, height: originalViewport.height });
        page.cleanup();
        const overallProgress = ((fileIndex + ((profileIndex + pageNumber / source.numPages) / profileCount)) / totalFiles) * 90;
        progress(`Compressing ${file.name} · page ${pageNumber} of ${source.numPages}`, overallProgress);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      const bytes = await output.save();
      return { bytes, targetMet: target === null || bytes.length <= target };
    } finally {
      if (source) await source.destroy();
      else await sourceTask.destroy();
    }
  }

  function addResult(file, originalSize, compressedBytes, targetMet, target) {
    const compressedSize = compressedBytes.length;
    const savedBytes = originalSize - compressedSize;
    const savings = originalSize ? (savedBytes / originalSize) * 100 : 0;
    const card = document.createElement("article");
    card.className = "compression-result";
    const heading = document.createElement("h3");
    heading.textContent = file.name;
    const stats = document.createElement("dl");
    [
      ["Original file size", formatBytes(originalSize)],
      ["Compressed file size", formatBytes(compressedSize)],
      ["Space saved", savedBytes >= 0 ? formatBytes(savedBytes) : `${formatBytes(Math.abs(savedBytes))} larger`],
      ["Compression", `${savings.toFixed(1)}% ${savings >= 0 ? "smaller" : "larger"}`]
    ].forEach(([label, value]) => {
      const item = document.createElement("div");
      const term = document.createElement("dt");
      term.textContent = label;
      const detail = document.createElement("dd");
      detail.textContent = value;
      item.append(term, detail);
      stats.append(item);
    });
    const link = document.createElement("a");
    link.className = "download-link";
    link.href = URL.createObjectURL(new Blob([compressedBytes], { type: "application/pdf" }));
    resultUrls.push(link.href);
    link.download = `${safeName(file.name)}-compressed.pdf`;
    link.textContent = "↓ Download compressed PDF";
    card.append(heading, stats, link);
    if (target !== null && !targetMet) {
      const note = document.createElement("p");
      note.className = "target-warning";
      note.textContent = `The requested ${formatBytes(target)} target could not be reached. This is the smallest version produced by the available quality settings.`;
      card.append(note);
    }
    if (savedBytes < 0) {
      const note = document.createElement("p");
      note.className = "target-warning";
      note.textContent = "This file became larger after compression. The original PDF may already be highly optimized.";
      card.append(note);
    }
    results.append(card);
  }

  async function compress() {
    if (processing || inspecting || files.length === 0) return;
    if (!window.pdfjsLib || !window.PDFLib) {
      setStatus("The PDF processing libraries did not load. Check your internet connection and reload.", true);
      return;
    }
    let target = null;
    try {
      if (modeSelect.value === "target") target = targetBytes();
    } catch (error) {
      setStatus(error.message, true);
      return;
    }
    processing = true;
    processedCount = 0;
    clearResults();
    progressWrap.classList.remove("hidden");
    anotherButton.classList.add("hidden");
    setStatus("Preparing files for compression…");
    updateButtons();
    const profiles = compressionProfiles(modeSelect.value);
    try {
      for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
        const file = files[fileIndex].file;
        let output;
        for (let profileIndex = 0; profileIndex < profiles.length; profileIndex++) {
          progress(`Compressing ${file.name} · quality pass ${profileIndex + 1} of ${profiles.length}`, (fileIndex / files.length) * 90);
          output = await createCompressedPdf(file, profiles[profileIndex], fileIndex, files.length, profileIndex, profiles.length, target);
          if (target === null || output.targetMet || profileIndex === profiles.length - 1) break;
        }
        addResult(file, file.size, output.bytes, output.targetMet, target);
        processedCount++;
        progress(`Finished ${file.name}`, ((fileIndex + 1) / files.length) * 100);
      }
      setStatus(`${processedCount} PDF${processedCount === 1 ? "" : "s"} compressed. Download your file${processedCount === 1 ? "" : "s"} below.`);
      anotherButton.classList.remove("hidden");
    } catch (error) {
      console.error(error);
      const message = error?.name === "PasswordException"
        ? "This PDF is password-protected. Remove the password with permission and try again."
        : error?.name === "RenderingCancelledException"
          ? "PDF processing was cancelled. Please try again."
          : error?.message?.includes("memory") || error?.name === "QuotaExceededError"
            ? "Your browser ran out of memory while processing this PDF. Try a smaller file or use a device with more memory."
            : `Could not compress the PDF. It may be damaged, encrypted, or too large for this device. ${error?.message || ""}`.trim();
      setStatus(message, true);
    } finally {
      processing = false;
      updateButtons();
    }
  }

  dropzone.addEventListener("click", () => { if (!processing && !inspecting) fileInput.click(); });
  dropzone.addEventListener("keydown", (event) => {
    if (!processing && !inspecting && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      fileInput.click();
    }
  });
  fileInput.addEventListener("change", () => {
    acceptFiles(fileInput.files);
    fileInput.value = "";
  });
  ["dragenter", "dragover"].forEach((eventName) => dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    if (!processing && !inspecting) dropzone.classList.add("dragover");
  }));
  ["dragleave", "drop"].forEach((eventName) => dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("dragover");
  }));
  dropzone.addEventListener("drop", (event) => acceptFiles(event.dataTransfer.files));
  modeSelect.addEventListener("change", renderSettings);
  targetSelect.addEventListener("change", renderSettings);
  clearButton.addEventListener("click", () => {
    if (processing || inspecting) return;
    files.splice(0, files.length);
    fileList.replaceChildren();
    clearResults();
    uploadError.textContent = "";
    progressWrap.classList.add("hidden");
    anotherButton.classList.add("hidden");
    setStatus("");
    updateButtons();
  });
  runButton.addEventListener("click", compress);
  anotherButton.addEventListener("click", () => {
    if (processing || inspecting) return;
    files.splice(0, files.length);
    fileList.replaceChildren();
    clearResults();
    progressWrap.classList.add("hidden");
    anotherButton.classList.add("hidden");
    uploadError.textContent = "";
    setStatus("");
    updateButtons();
    dropzone.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  if (menuToggle) menuToggle.addEventListener("click", () => $(".topnav").classList.toggle("open"));
  renderSettings();
  updateButtons();
})();
