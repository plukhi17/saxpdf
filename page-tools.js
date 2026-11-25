(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const mode = document.body.dataset.pageTool;
  const dropzone = $("#pageDropzone");
  const fileInput = $("#pageFileInput");
  const insertInput = $("#insertFileInput");
  const pageGrid = $("#pageGrid");
  const pageCount = $("#pageCount");
  const runButton = $("#pageRunBtn");
  const clearButton = $("#pageClearBtn");
  const status = $("#pageStatus");
  const downloadArea = $("#pageDownload");
  const sources = [];
  const thumbnailPages = new WeakMap();
  const thumbnailObserver = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const target = entry.target;
        thumbnailObserver.unobserve(target);
        const details = thumbnailPages.get(target);
        if (details) drawThumbnail(details.page, details.canvas);
      });
    }, { rootMargin: "240px" })
    : null;
  let pages = [];
  let busy = false;
  let draggedPage = null;
  let resultUrl = null;

  const isSelectionTool = mode === "extract" || mode === "remove";
  function setStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle("error", isError);
  }

  function clearResult() {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = null;
    downloadArea.replaceChildren();
  }

  function setBusy(value) {
    busy = value;
    fileInput.disabled = value;
    if (insertInput) insertInput.disabled = value;
    dropzone.setAttribute("aria-disabled", String(value));
    pageGrid.querySelectorAll("button, input").forEach((control) => {
      control.disabled = value;
    });
    pageGrid.querySelectorAll(".page-card").forEach((card) => {
      card.draggable = mode === "organize" && !value;
    });
    updatePageCount();
  }

  function updateRunButton() {
    if (busy) {
      runButton.disabled = true;
      runButton.textContent = "Processing…";
      return;
    }

    const selectedCount = pages.filter((page) => page.selected).length;
    const enabled = pages.length > 0 && (!isSelectionTool || selectedCount > 0);
    runButton.disabled = !enabled;
    if (mode === "organize") {
      runButton.innerHTML = pages.length ? "Save organized PDF <span>→</span>" : "Choose a PDF first <span>→</span>";
    } else {
      const verb = mode === "extract" ? "Extract" : "Remove";
      runButton.innerHTML = enabled ? `${verb} ${selectedCount} page${selectedCount === 1 ? "" : "s"} <span>→</span>` : "Select pages first <span>→</span>";
    }
  }

  function updatePageCount() {
    if (!pages.length) {
      pageCount.textContent = "Choose a PDF to see its pages.";
    } else if (mode === "organize") {
      pageCount.textContent = `${pages.length} page${pages.length === 1 ? "" : "s"} · Drag to reorder, or use the controls on each page.`;
    } else {
      const selectedCount = pages.filter((page) => page.selected).length;
      pageCount.textContent = `${pages.length} page${pages.length === 1 ? "" : "s"} · ${selectedCount} selected`;
    }
    updateRunButton();
    clearButton.disabled = busy || pages.length === 0;
    document.querySelectorAll(".page-selection-controls button").forEach((button) => {
      button.disabled = busy || pages.length === 0;
    });
  }

  async function destroySources() {
    const oldSources = sources.splice(0, sources.length);
    pages = [];
    pageGrid.replaceChildren();
    for (const source of oldSources) {
      try {
        await source.pdf.destroy();
      } catch (error) {
        console.warn("Could not release a PDF preview:", error);
      }
      source.bytes.fill(0);
    }
    updatePageCount();
  }

  async function readPdf(file) {
    if (!file || (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf"))) {
      throw new Error("Choose a PDF file.");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const header = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 1024)));
    if (!header.includes("%PDF-")) {
      bytes.fill(0);
      throw new Error(`${file.name} does not have a valid PDF signature.`);
    }
    if (!window.pdfjsLib || !window.PDFLib) {
      bytes.fill(0);
      throw new Error("The PDF processing libraries did not load. Check your connection and reload.");
    }
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    let task;
    try {
      task = pdfjsLib.getDocument({ data: bytes.slice() });
      const pdf = await task.promise;
      return { file, bytes, pdf };
    } catch (error) {
      bytes.fill(0);
      if (error?.name === "PasswordException") {
        throw new Error(`${file.name} is password-protected. This page cannot open encrypted PDFs.`);
      }
      throw new Error(`${file.name} could not be opened. It may be damaged or use an unsupported PDF feature.`);
    }
  }

  function makePageCard(page, position) {
    const card = document.createElement("article");
    card.className = "page-card";
    card.draggable = mode === "organize";
    card.setAttribute("aria-label", `Page ${position + 1}`);
    const preview = document.createElement("div");
    preview.className = "page-preview";
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-label", `Preview of page ${page.pageNumber}`);
    preview.append(canvas);

    const details = document.createElement("div");
    details.className = "page-card-details";
    const number = document.createElement("strong");
    number.className = "page-card-number";
    number.textContent = `Page ${position + 1}`;
    const origin = document.createElement("small");
    origin.textContent = page.sourceName;
    details.append(number, origin);

    card.append(preview, details);
    if (isSelectionTool) {
      const label = document.createElement("label");
      label.className = "page-select-label";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = page.selected;
      checkbox.disabled = busy;
      checkbox.setAttribute("aria-label", `Select page ${page.pageNumber}`);
      checkbox.addEventListener("change", () => {
        page.selected = checkbox.checked;
        card.classList.toggle("selected", page.selected);
        clearResult();
        setStatus("");
        updatePageCount();
      });
      label.append(checkbox, document.createTextNode(mode === "extract" ? "Extract" : "Remove"));
      card.classList.toggle("selected", page.selected);
      card.append(label);
    } else {
      const controls = document.createElement("div");
      controls.className = "page-card-actions";
      const up = makeActionButton("↑", `Move page ${position + 1} up`, () => movePage(page, -1));
      const down = makeActionButton("↓", `Move page ${position + 1} down`, () => movePage(page, 1));
      const rotate = makeActionButton("↻", `Rotate page ${position + 1} clockwise`, () => rotatePage(page, canvas));
      const remove = makeActionButton("×", `Delete page ${position + 1}`, () => removePage(page));
      controls.append(up, down, rotate, remove);
      controls.querySelectorAll("button").forEach((button) => {
        button.disabled = busy;
      });
      card.append(controls);
      card.addEventListener("dragstart", (event) => {
        draggedPage = page;
        card.classList.add("dragging");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(page.pageNumber));
      });
      card.addEventListener("dragend", () => {
        draggedPage = null;
        card.classList.remove("dragging");
        pageGrid.querySelectorAll(".drag-over").forEach((item) => item.classList.remove("drag-over"));
      });
      card.addEventListener("dragover", (event) => {
        if (draggedPage && draggedPage !== page) {
          event.preventDefault();
          card.classList.add("drag-over");
        }
      });
      card.addEventListener("dragleave", () => card.classList.remove("drag-over"));
      card.addEventListener("drop", (event) => {
        event.preventDefault();
        card.classList.remove("drag-over");
        if (draggedPage && draggedPage !== page) reorderPage(draggedPage, page);
      });
    }
    page.element = card;
    page.canvas = canvas;
    renderThumbnail(page, canvas);
    return card;
  }

  function makeActionButton(text, label, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "page-action";
    button.textContent = text;
    button.setAttribute("aria-label", label);
    button.addEventListener("click", action);
    return button;
  }

  async function renderThumbnail(page, canvas) {
    if (thumbnailObserver) {
      thumbnailPages.set(canvas, { page, canvas });
      thumbnailObserver.observe(canvas);
      return;
    }
    requestAnimationFrame(() => drawThumbnail(page, canvas));
  }

  async function drawThumbnail(page, canvas) {
    const source = sources[page.sourceIndex];
    if (!source || !page.element?.isConnected) return;
    try {
      const pdfPage = await source.pdf.getPage(page.pageNumber);
      const base = pdfPage.getViewport({ scale: 1 });
      const scale = Math.min(0.34, 136 / base.width, 176 / base.height);
      const viewport = pdfPage.getViewport({ scale });
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Your browser could not create a page preview.");
      await pdfPage.render({ canvasContext: context, viewport }).promise;
      if (!page.element?.isConnected) {
        canvas.width = 0;
        canvas.height = 0;
        return;
      }
      canvas.style.transform = `rotate(${page.rotation}deg)`;
      pdfPage.cleanup();
    } catch (error) {
      if (sources[page.sourceIndex] === source) {
        const message = document.createElement("small");
        message.className = "page-preview-error";
        message.textContent = "Preview unavailable";
        canvas.replaceWith(message);
      }
    }
  }

  function refreshPageLabels() {
    pages.forEach((page, index) => {
      page.element.setAttribute("aria-label", `Page ${index + 1}`);
      page.element.querySelector(".page-card-number").textContent = `Page ${index + 1}`;
      const checkbox = page.element.querySelector('input[type="checkbox"]');
      if (checkbox) checkbox.setAttribute("aria-label", `Select page ${index + 1}`);
      const buttons = page.element.querySelectorAll(".page-action");
      if (buttons.length) {
        buttons[0].setAttribute("aria-label", `Move page ${index + 1} up`);
        buttons[1].setAttribute("aria-label", `Move page ${index + 1} down`);
        buttons[2].setAttribute("aria-label", `Rotate page ${index + 1} clockwise`);
        buttons[3].setAttribute("aria-label", `Delete page ${index + 1}`);
      }
      pageGrid.append(page.element);
    });
    updatePageCount();
  }

  function reorderPage(page, target) {
    if (busy) return;
    const from = pages.indexOf(page);
    const to = pages.indexOf(target);
    if (from < 0 || to < 0) return;
    pages.splice(from, 1);
    pages.splice(to, 0, page);
    refreshPageLabels();
    clearResult();
    setStatus("Page order changed. Save the PDF to create an updated copy.");
  }

  function movePage(page, offset) {
    if (busy) return;
    const index = pages.indexOf(page);
    const next = index + offset;
    if (next < 0 || next >= pages.length) return;
    pages.splice(next, 0, pages.splice(index, 1)[0]);
    refreshPageLabels();
    clearResult();
    setStatus("Page order changed. Save the PDF to create an updated copy.");
  }

  function rotatePage(page, canvas) {
    if (busy) return;
    page.rotation = (page.rotation + 90) % 360;
    canvas.style.transform = `rotate(${page.rotation}deg)`;
    clearResult();
    setStatus("Page rotation changed. Save the PDF to create an updated copy.");
  }

  function removePage(page) {
    if (busy) return;
    if (pages.length <= 1) {
      setStatus("A PDF must contain at least one page.", true);
      return;
    }
    pages = pages.filter((item) => item !== page);
    page.element.remove();
    refreshPageLabels();
    clearResult();
    setStatus("Page removed from the arrangement. Save the PDF to create an updated copy.");
  }

  async function appendPdf(file) {
    const source = await readPdf(file);
    const sourceIndex = sources.length;
    sources.push(source);
    for (let pageNumber = 1; pageNumber <= source.pdf.numPages; pageNumber++) {
      const page = {
        sourceIndex,
        sourceName: file.name,
        pageNumber,
        rotation: 0,
        selected: false
      };
      pages.push(page);
      pageGrid.append(makePageCard(page, pages.length - 1));
      updatePageCount();
      setStatus(`Preparing page previews: ${pages.length} of ${pages.length + source.pdf.numPages - pageNumber}`);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }

  async function loadMainPdf(file) {
    if (busy) return;
    setBusy(true);
    clearResult();
    if ($("#pageRange")) $("#pageRange").value = "";
    setStatus("Opening PDF…");
    try {
      await destroySources();
      await appendPdf(file);
      setStatus(`Loaded ${pages.length} page${pages.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setStatus(error.message || "The PDF could not be opened.", true);
      if (!pages.length) await destroySources();
    } finally {
      setBusy(false);
    }
  }

  async function insertPdfs(fileList) {
    if (busy) return;
    const selectedFiles = Array.from(fileList);
    if (!selectedFiles.length) return;
    setBusy(true);
    clearResult();
    try {
      for (const file of selectedFiles) {
        setStatus(`Adding pages from ${file.name}…`);
        await appendPdf(file);
      }
      setStatus(`Added pages. The document now has ${pages.length} page${pages.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setStatus(error.message || "Could not insert the selected PDF.", true);
    } finally {
      setBusy(false);
      insertInput.value = "";
    }
  }

  function parsePageRange(text) {
    const selected = new Set();
    for (const item of text.split(",")) {
      const match = item.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (!match) throw new Error("Enter page numbers such as 1, 3-5, 8.");
      const first = Number(match[1]);
      const last = Number(match[2] || match[1]);
      if (first < 1 || last < first || last > pages.length) {
        throw new Error(`Page numbers must be between 1 and ${pages.length}.`);
      }
      for (let page = first; page <= last; page++) selected.add(page);
    }
    if (!selected.size) throw new Error("Enter at least one page number or range.");
    return selected;
  }

  function setSelection(predicate) {
    pages.forEach((page, index) => {
      page.selected = predicate(index);
      const checkbox = page.element.querySelector('input[type="checkbox"]');
      if (checkbox) checkbox.checked = page.selected;
      page.element.classList.toggle("selected", page.selected);
    });
    updatePageCount();
    clearResult();
    setStatus("");
  }

  function applyRange() {
    try {
      const selected = parsePageRange($("#pageRange").value);
      setSelection((index) => selected.has(index + 1));
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  async function processPdf() {
    if (busy || !pages.length) return;
    const selectedPages = pages.filter((page) => page.selected);
    if (isSelectionTool && !selectedPages.length) {
      setStatus(mode === "extract" ? "Select at least one page to extract." : "Select at least one page to remove.", true);
      return;
    }
    if (mode === "remove" && selectedPages.length === pages.length) {
      setStatus("At least one page must remain in the output.", true);
      return;
    }

    setBusy(true);
    clearResult();
    const outputPages = mode === "extract"
      ? pages.filter((page) => page.selected)
      : mode === "remove"
        ? pages.filter((page) => !page.selected)
        : pages;
    try {
      const documents = [];
      for (const source of sources) {
        documents.push(await PDFLib.PDFDocument.load(source.bytes));
      }
      const output = await PDFLib.PDFDocument.create();
      for (const [index, page] of outputPages.entries()) {
        setStatus(`Building PDF: page ${index + 1} of ${outputPages.length}…`);
        const [copy] = await output.copyPages(documents[page.sourceIndex], [page.pageNumber - 1]);
        if (mode === "organize" && page.rotation) {
          const current = copy.getRotation().angle;
          copy.setRotation(PDFLib.degrees((current + page.rotation) % 360));
        }
        output.addPage(copy);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      setStatus("Saving the new PDF…");
      const bytes = await output.save();
      const blob = new Blob([bytes], { type: "application/pdf" });
      resultUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = resultUrl;
      link.download = `${sources[0].file.name.replace(/\.pdf$/i, "").replace(/[^a-z0-9_-]+/gi, "_") || "document"}-${mode === "organize" ? "organized" : mode === "extract" ? "extracted" : "pages-removed"}.pdf`;
      link.className = "download-link";
      const resultLabel = mode === "organize" ? "organized PDF" : mode === "extract" ? "extracted pages" : "PDF with pages removed";
      link.textContent = `↓ Download ${resultLabel} (${outputPages.length} pages)`;
      downloadArea.append(link);
      setStatus(`Done. The new PDF contains ${outputPages.length} page${outputPages.length === 1 ? "" : "s"}.`);
    } catch (error) {
      const passwordMessage = error?.name === "EncryptedPDFError" || /encrypted|password/i.test(error?.message || "");
      setStatus(passwordMessage ? "This PDF is password-protected or encrypted and could not be processed." : `Could not create the PDF. The file may be damaged or too large for this device. ${error?.message || ""}`.trim(), true);
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (busy) return;
    clearResult();
    await destroySources();
    setStatus("");
    fileInput.value = "";
    if (insertInput) insertInput.value = "";
    if ($("#pageRange")) $("#pageRange").value = "";
    updatePageCount();
  }

  dropzone.addEventListener("click", () => {
    if (!busy) fileInput.click();
  });
  dropzone.addEventListener("keydown", (event) => {
    if (!busy && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      fileInput.click();
    }
  });
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    fileInput.value = "";
    if (file) loadMainPdf(file);
  });
  dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (!busy) dropzone.classList.add("dragover");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropzone.classList.remove("dragover");
    if (!busy && event.dataTransfer.files[0]) loadMainPdf(event.dataTransfer.files[0]);
  });
  insertInput?.addEventListener("change", () => insertPdfs(insertInput.files));
  runButton.addEventListener("click", processPdf);
  clearButton.addEventListener("click", reset);
  $("#selectAllBtn")?.addEventListener("click", () => setSelection(() => true));
  $("#selectNoneBtn")?.addEventListener("click", () => setSelection(() => false));
  $("#selectOddBtn")?.addEventListener("click", () => setSelection((index) => (index + 1) % 2 === 1));
  $("#selectEvenBtn")?.addEventListener("click", () => setSelection((index) => (index + 1) % 2 === 0));
  $("#applyRangeBtn")?.addEventListener("click", applyRange);
  $("#pageRange")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") applyRange();
  });
  $("#menuToggle")?.addEventListener("click", () => $(".topnav").classList.toggle("open"));
  window.addEventListener("pagehide", () => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    sources.forEach((source) => {
      source.bytes.fill(0);
      source.pdf.destroy();
    });
  });
  updatePageCount();
})();
