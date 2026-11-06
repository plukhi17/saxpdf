(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const fileInput = $("#fileInput"), dropzone = $("#dropzone"), fileList = $("#fileList");
  const optionsBox = $("#toolOptions"), runBtn = $("#runBtn"), status = $("#status"), downloadArea = $("#downloadArea");
  const workspaceTitle = $("#workspaceTitle"), workspaceDescription = $("#workspaceDescription"), fileHint = $("#fileHint");
  const workspace = $("#workspace");
  let files = [], activeTool = null, objectUrls = [];
  const toolInfo = {
    merge: ["Merge PDF", "Combine two or more PDFs in the order shown.", "Select at least two PDF files."],
    split: ["Split PDF", "Extract a range of pages into a new PDF.", "Choose one PDF and enter a page range."],
    rotate: ["Rotate PDF", "Rotate every page or a selected page range.", "Choose a PDF and rotation angle."],
    crop: ["Crop PDF", "Trim the visible page area by setting margins in points.", "Choose a PDF and set crop margins. The crop is applied to all pages."],
    jpg: ["PDF to JPG", "Render PDF pages as JPG images and download them individually.", "Choose one PDF. PDF.js is required."],
    jpgpdf: ["JPG to PDF", "Combine JPG or PNG images into a PDF.", "Choose one or more JPG or PNG images."],
    watermark: ["Add watermark", "Place a text watermark on each page.", "Choose a PDF and enter the watermark text."],
    pages: ["Page numbers", "Add page numbers at the bottom of each page.", "Choose a PDF to number."],
    unprotect: ["Unlock PDF", "Create an unprotected, image-only copy using the PDF password.", "Choose a PDF. Its pages will become images, so text will not be selectable."]
  };
  const bytesLabel = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n/1024).toFixed(1)} KB` : `${(n/1048576).toFixed(2)} MB`;
  const safeName = name => name.replace(/\.pdf$/i, "").replace(/[^a-z0-9_-]+/gi, "_").slice(0, 60) || "document";
  function setStatus(message, error=false) { if (!status) return; status.textContent=message; status.classList.toggle("error",error); }
  function clearDownloads() { objectUrls.forEach(URL.revokeObjectURL); objectUrls=[]; if (downloadArea) downloadArea.replaceChildren(); }
  function addDownload(blob, filename, label="Download result") {
    const url=URL.createObjectURL(blob); objectUrls.push(url);
    const a=document.createElement("a"); a.href=url; a.download=filename; a.className="download-link"; a.textContent=`↓ ${label}: ${filename}`; if (downloadArea) downloadArea.append(a);
  }
  function addOption(label, type, name, value, extra={}) {
    const wrap=document.createElement("label"); wrap.textContent=label;
    const input=document.createElement(type==="select"?"select":"input"); input.dataset.option=name;
    if(type==="select"){ extra.choices.forEach(([v,t])=>{const o=document.createElement("option");o.value=v;o.textContent=t;input.append(o);}); input.value=value; }
    else { input.type=type; input.value=value; if(extra.min!==undefined) input.min=extra.min; if(extra.max!==undefined) input.max=extra.max; if(extra.step!==undefined) input.step=extra.step; if(extra.accept) input.accept=extra.accept; }
    wrap.append(input); if(extra.wide) wrap.classList.add("option-wide"); optionsBox.append(wrap);
  }
  function buildOptions() {
    if (!optionsBox || !fileInput) return; optionsBox.replaceChildren(); optionsBox.classList.add("hidden"); if(!activeTool) return;
    if(activeTool==="split"){addOption("Page range (e.g. 1-3)","text","range","1-1",{wide:true});}
    if(activeTool==="rotate"){addOption("Rotation","select","angle","90",{choices:[["90","90° clockwise"],["180","180°"],["270","270° clockwise"]]});addOption("Page range (blank = all)","text","range","",{wide:true});}
    if(activeTool==="crop"){addOption("Top margin (points)","number","top","20",{min:0,max:10000});addOption("Right margin (points)","number","right","20",{min:0,max:10000});addOption("Bottom margin (points)","number","bottom","20",{min:0,max:10000});addOption("Left margin (points)","number","left","20",{min:0,max:10000});}
    if(activeTool==="watermark"){addOption("Watermark text","text","text","CONFIDENTIAL",{wide:true});}
    if(activeTool==="unprotect"){addOption("PDF password","password","password","",{wide:true});}
    if(activeTool==="jpgpdf"){fileInput.accept="image/jpeg,image/png";fileInput.multiple=true;}
    else {fileInput.accept="application/pdf";fileInput.multiple=activeTool==="merge";}
    if(!["merge","split","jpg","jpgpdf","unprotect"].includes(activeTool)) addOption("Page range (blank = all, e.g. 1-3)","text","range","",{wide:true});
    optionsBox.classList.remove("hidden");
  }
  function option(name){return optionsBox.querySelector(`[data-option="${name}"]`)?.value ?? "";}
  function clearPassword(){const input=optionsBox?.querySelector('[data-option="password"]');if(input)input.value="";}
  function animateFileArrival(){
    if(!dropzone)return;
    dropzone.classList.remove("file-added");
    void dropzone.offsetWidth;
    dropzone.classList.add("file-added");
    window.setTimeout(()=>dropzone.classList.remove("file-added"),650);
  }
  function parseRange(text,total){
    if(!text.trim()) return Array.from({length:total},(_,i)=>i);
    const out=new Set();
    for(const part of text.split(",")){const m=part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);if(!m)throw Error("Use page numbers like 1-3 or 1,3,5.");let a=Number(m[1]),b=Number(m[2]||m[1]);if(a<1||b<a||b>total)throw Error(`Page range must be between 1 and ${total}.`);for(let n=a;n<=b;n++)out.add(n-1);}
    return [...out].sort((a,b)=>a-b);
  }
  function renderFiles(){
    if (!fileList || !runBtn) return;
    fileList.replaceChildren();
    files.forEach((f,i)=>{const row=document.createElement("div");row.className="file-row";const icon=document.createElement("span");icon.className="mini-pdf";icon.textContent=f.type.startsWith("image/")?"IMG":"PDF";const info=document.createElement("div");info.className="file-info";const b=document.createElement("b");b.textContent=f.name;const sm=document.createElement("small");sm.textContent=bytesLabel(f.size);info.append(b,sm);const remove=document.createElement("button");remove.className="remove-file";remove.type="button";remove.textContent="Remove";remove.setAttribute("aria-label",`Remove ${f.name}`);remove.onclick=()=>{files.splice(i,1);if(activeTool==="unprotect")clearPassword();renderFiles();clearDownloads();};row.append(icon,info,remove);fileList.append(row);});
    runBtn.disabled=!files.length;runBtn.innerHTML=files.length?`Process ${files.length} file${files.length===1?"":"s"} <span>→</span>`:"Choose files first <span>→</span>";
  }
  function chooseTool(tool, scroll=true){
    if (!toolInfo[tool]) return;
    activeTool=tool; const info=toolInfo[tool]; if(workspaceTitle) workspaceTitle.textContent=info[0]; if(workspaceDescription) workspaceDescription.textContent=info[1]; if(fileHint) fileHint.textContent=info[2];
    if(workspace){workspace.dataset.motionTool=tool;workspace.dataset.state="ready";workspace.classList.remove("is-processing");}
    buildOptions(); clearDownloads(); setStatus(""); document.querySelectorAll(".tool-card").forEach(c=>c.classList.toggle("selected",c.dataset.tool===tool));
    if(tool==="jpgpdf") files=[]; renderFiles();
    if(scroll && workspace) workspace.scrollIntoView({behavior:"smooth",block:"start"});
  }
  document.querySelectorAll(".tool-card[data-tool]").forEach(card=>{
    if(card.tagName.toLowerCase() === "button") card.addEventListener("click",()=>chooseTool(card.dataset.tool));
  });
  document.querySelectorAll(".category").forEach(btn=>btn.addEventListener("click",()=>{document.querySelectorAll(".category").forEach(b=>b.classList.toggle("active",b===btn));filterTools();}));
  const toolSearch=$("#toolSearch"); if(toolSearch) toolSearch.addEventListener("input",filterTools);
  function filterTools(){const activeCategory=document.querySelector(".category.active"), search=$("#toolSearch"); if(!activeCategory||!search)return; const cat=activeCategory.dataset.category, q=search.value.toLowerCase();document.querySelectorAll(".tool-card").forEach(c=>{c.classList.toggle("hidden",!(cat==="all"||c.dataset.category===cat)||!c.innerText.toLowerCase().includes(q));});}
  function acceptFiles(selected){
    const chosen=[...selected]; if(!chosen.length)return;
    if(activeTool==="jpgpdf"){const valid=chosen.filter(f=>["image/jpeg","image/png"].includes(f.type));if(valid.length!==chosen.length){setStatus("Please select JPG or PNG images only.",true);return;}files=[...files,...valid];}
    else {const valid=chosen.filter(f=>f.type==="application/pdf"||f.name.toLowerCase().endsWith(".pdf"));if(valid.length!==chosen.length){setStatus("Please select PDF files only.",true);return;}files=activeTool==="merge"?[...files,...valid]:valid.slice(0,1);}
    if(activeTool==="unprotect")clearPassword();clearDownloads();setStatus("");if(workspace){workspace.dataset.state="ready";workspace.classList.remove("is-processing");}renderFiles();animateFileArrival();
  }
  if (dropzone && fileInput) {
    dropzone.addEventListener("click",()=>fileInput.click());dropzone.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();fileInput.click();}});
    fileInput.addEventListener("change",()=>{acceptFiles(fileInput.files);fileInput.value="";});
    ["dragenter","dragover"].forEach(ev=>dropzone.addEventListener(ev,e=>{e.preventDefault();dropzone.classList.add("dragover");}));
    ["dragleave","drop"].forEach(ev=>dropzone.addEventListener(ev,e=>{e.preventDefault();dropzone.classList.remove("dragover");}));
    dropzone.addEventListener("drop",e=>acceptFiles(e.dataTransfer.files));
  }
  const clearBtn=$("#clearBtn"); if(clearBtn) clearBtn.addEventListener("click",()=>{files=[];if(activeTool==="unprotect")clearPassword();renderFiles();clearDownloads();setStatus("");if(workspace){workspace.dataset.state="ready";workspace.classList.remove("is-processing");}});
  const menuToggle=$("#menuToggle"); if(menuToggle) menuToggle.addEventListener("click",()=>$(".topnav").classList.toggle("open"));

  async function loadPdf(file){return PDFLib.PDFDocument.load(await file.arrayBuffer());}
  async function process(){
    let completed=false;
    clearDownloads(); setStatus("Processing…");runBtn.disabled=true;
    if(workspace){workspace.dataset.state="processing";workspace.classList.add("is-processing");}
    try{
      if(!activeTool)throw Error("Choose a tool first.");
      if(!files.length)throw Error("Add files first.");
      await new Promise(resolve=>requestAnimationFrame(resolve));
      if(activeTool==="unprotect"){
        if(!window.pdfjsLib)throw Error("PDF.js did not load. Check your internet connection and reload.");
        if(!window.PDFLib)throw Error("PDF-Lib did not load. Check your internet connection and reload.");
        pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        let source;
        try{
          source=await pdfjsLib.getDocument({data:await files[0].arrayBuffer(),password:option("password")}).promise;
        }catch(error){
          if(error?.name==="PasswordException")throw Error("The password is missing or incorrect. Check it and try again.");
          throw error;
        }
        const output=await PDFLib.PDFDocument.create();
        let outputBytes;
        try{
          for(let pageNumber=1;pageNumber<=source.numPages;pageNumber++){
            setStatus(`Preparing page ${pageNumber} of ${source.numPages} for unlock…`);
            const page=await source.getPage(pageNumber);
            const baseViewport=page.getViewport({scale:1});
            const viewport=page.getViewport({scale:1.5});
            const canvas=document.createElement("canvas");
            canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
            const context=canvas.getContext("2d");
            if(!context)throw Error("Your browser could not prepare a page for conversion.");
            await page.render({canvasContext:context,viewport}).promise;
            const imageBlob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.92));
            canvas.width=canvas.height=0;
            if(!imageBlob)throw Error(`Could not render page ${pageNumber}.`);
            const image=await output.embedJpg(await imageBlob.arrayBuffer());
            const outputPage=output.addPage([baseViewport.width,baseViewport.height]);
            outputPage.drawImage(image,{x:0,y:0,width:baseViewport.width,height:baseViewport.height});
            setStatus(`Unlocking page ${pageNumber} of ${source.numPages}…`);
          }
          outputBytes=await output.save();
        }finally{
          await source.destroy();
        }
        addDownload(new Blob([outputBytes],{type:"application/pdf"}),`${safeName(files[0].name)}-unlocked.pdf`);
        clearPassword();
        setStatus("PDF unlocked. The output has no password protection; its pages are rasterized and text is not selectable.");
      } else if (activeTool === "merge") {
  if (files.length < 2) {
    throw Error("Choose at least two PDF files to merge.");
  }

  const out = await PDFLib.PDFDocument.create();

  for (const [fileIndex, f] of files.entries()) {
    setStatus(`Combining document ${fileIndex + 1} of ${files.length}…`);
    const src = await loadPdf(f);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach(p => out.addPage(p));
  }

  // Use the first selected PDF's original filename
  const originalName = files[0].name.replace(/\.pdf$/i, "");
  const outputName = `${originalName}_merged.pdf`;

  addDownload(
    new Blob([await out.save()], { type: "application/pdf" }),
    outputName
  );

 // Clear the old selected files after a successful merge
  document.getElementById("fileInput").value = "";
  document.getElementById("fileList").innerHTML = "";

  setStatus("Merge complete. You can select new PDF files.");
}else if(activeTool==="jpgpdf"){
        const out=await PDFLib.PDFDocument.create();
        for(const [imageIndex,f] of files.entries()){setStatus(`Adding image ${imageIndex+1} of ${files.length}…`);const data=await f.arrayBuffer();const img=f.type==="image/png"?await out.embedPng(data):await out.embedJpg(data);const page=out.addPage([img.width,img.height]);page.drawImage(img,{x:0,y:0,width:img.width,height:img.height});}
        addDownload(new Blob([await out.save()],{type:"application/pdf"}),"images.pdf");setStatus("Image-to-PDF conversion complete.");
      } else if(activeTool==="jpg"){
        if(!window.pdfjsLib)throw Error("PDF.js did not load. Check your internet connection and reload.");
        pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        const pdf=await pdfjsLib.getDocument({data:await files[0].arrayBuffer()}).promise;
        for(let i=1;i<=pdf.numPages;i++){setStatus(`Rendering page ${i} of ${pdf.numPages} as JPG…`);const page=await pdf.getPage(i);const viewport=page.getViewport({scale:1.5});const canvas=document.createElement("canvas");canvas.width=viewport.width;canvas.height=viewport.height;await page.render({canvasContext:canvas.getContext("2d"),viewport}).promise;const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.92));addDownload(blob,`${safeName(files[0].name)}-page-${i}.jpg`,`Page ${i}`);canvas.width=canvas.height=0;}
        setStatus(`Rendered ${pdf.numPages} page(s). Download each JPG below.`);
      } else {
        const pdf=await loadPdf(files[0]), pages=pdf.getPages(), indices=parseRange(option("range"),pages.length);
        if(activeTool==="split"){
          setStatus(`Extracting ${indices.length} page${indices.length===1?"":"s"}…`);
          const out=await PDFLib.PDFDocument.create();const copied=await out.copyPages(pdf,indices);copied.forEach(p=>out.addPage(p));addDownload(new Blob([await out.save()],{type:"application/pdf"}),`${safeName(files[0].name)}-split.pdf`);setStatus("Page extraction complete.");
        } else {
          if(!indices.length)throw Error("Choose at least one page.");
          if(activeTool==="rotate"){const angle=Number(option("angle"));setStatus(`Rotating ${indices.length} page${indices.length===1?"":"s"}…`);indices.forEach(i=>pages[i].setRotation(PDFLib.degrees((pages[i].getRotation().angle+angle)%360)));}
          if(activeTool==="crop"){
            setStatus(`Cropping ${indices.length} page${indices.length===1?"":"s"}…`);
            const margins={top:Number(option("top")),right:Number(option("right")),bottom:Number(option("bottom")),left:Number(option("left"))};
            if(Object.values(margins).some(n=>!Number.isFinite(n)||n<0))throw Error("Margins must be non-negative numbers.");
            indices.forEach(i=>{const p=pages[i], size=p.getSize(), w=size.width-margins.left-margins.right,h=size.height-margins.top-margins.bottom;if(w<=0||h<=0)throw Error("Crop margins are too large for one or more pages.");p.setCropBox(margins.left,margins.bottom,w,h);});
          }
          if(activeTool==="watermark"){
            const text=option("text").trim();if(!text)throw Error("Enter watermark text.");
            setStatus(`Adding watermark to ${indices.length} page${indices.length===1?"":"s"}…`);
            const font=await pdf.embedFont(PDFLib.StandardFonts.Helvetica);
            indices.forEach(i=>{const p=pages[i],size=p.getSize();p.drawText(text,{x:size.width*.12,y:size.height*.5,size:Math.max(18,Math.min(size.width,size.height)*.045),font,color:PDFLib.rgb(.75,.18,.22),opacity:.32,rotate:PDFLib.degrees(30),maxWidth:size.width*.8});});
          }
          if(activeTool==="pages"){
            setStatus(`Numbering ${indices.length} page${indices.length===1?"":"s"}…`);
            const font=await pdf.embedFont(PDFLib.StandardFonts.Helvetica);
            indices.forEach(i=>{const p=pages[i],size=p.getSize(),label=String(i+1),fontSize=10;p.drawText(label,{x:(size.width-font.widthOfTextAtSize(label,fontSize))/2,y:18,size:fontSize,font,color:PDFLib.rgb(.25,.28,.35)});});
          }
          const label={rotate:"Rotation",crop:"Crop",watermark:"Watermark",pages:"Page numbering"}[activeTool];
          addDownload(new Blob([await pdf.save()],{type:"application/pdf"}),`${safeName(files[0].name)}-${activeTool}.pdf`);setStatus(`${label} complete.`);
        }
      }
      completed=true;
    }catch(err){console.error(err);setStatus(err.message||"Could not process this file. It may be invalid or encrypted.",true);}
    finally{
      if(workspace){workspace.classList.remove("is-processing");workspace.dataset.state=completed?"complete":"error";}
      runBtn.disabled=!files.length;runBtn.innerHTML=files.length?`Process ${files.length} file${files.length===1?"":"s"} <span>→</span>`:"Choose files first <span>→</span>";
    }
  }
  if (runBtn) runBtn.addEventListener("click",process);
  const pageTool=document.body.dataset.tool;
  if (pageTool) chooseTool(pageTool, false); else if ($("#workspace")) chooseTool("merge", false);

  const reducedMotion=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer=window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const lowMemory=typeof navigator.deviceMemory==="number"&&navigator.deviceMemory<=4;
  const lowPower=lowMemory||(typeof navigator.hardwareConcurrency==="number"&&navigator.hardwareConcurrency<=4);
  if(lowPower)document.documentElement.classList.add("low-power");
  const heroArt=$(".hero-art"), heroSection=$(".hero");
  if(heroArt){
    if("IntersectionObserver" in window){
      const observer=new IntersectionObserver(entries=>entries.forEach(entry=>heroArt.classList.toggle("is-visible",entry.isIntersecting)),{threshold:.05});
      observer.observe(heroArt);
    }else heroArt.classList.add("is-visible");
    if(finePointer&&!reducedMotion&&!lowPower&&heroSection){
      let frame=0;
      heroSection.addEventListener("pointermove",event=>{
        if(frame)cancelAnimationFrame(frame);
        frame=requestAnimationFrame(()=>{
          const bounds=heroArt.getBoundingClientRect();
          const x=Math.max(-1,Math.min(1,(event.clientX-(bounds.left+bounds.width/2))/(bounds.width/2)));
          const y=Math.max(-1,Math.min(1,(event.clientY-(bounds.top+bounds.height/2))/(bounds.height/2)));
          heroArt.style.setProperty("--hero-x",`${x*12}px`);
          heroArt.style.setProperty("--hero-y",`${y*10}px`);
          heroArt.style.setProperty("--hero-rotate-x",`${-y*2.5}deg`);
          heroArt.style.setProperty("--hero-rotate-y",`${x*3.5}deg`);
        });
      },{passive:true});
      heroSection.addEventListener("pointerleave",()=>{
        heroArt.style.setProperty("--hero-x","0px");
        heroArt.style.setProperty("--hero-y","0px");
        heroArt.style.setProperty("--hero-rotate-x","0deg");
        heroArt.style.setProperty("--hero-rotate-y","0deg");
      },{passive:true});
      document.querySelectorAll(".tool-card").forEach(card=>{
        card.addEventListener("pointermove",event=>{
          const bounds=card.getBoundingClientRect();
          const x=(event.clientX-bounds.left)/bounds.width-.5;
          const y=(event.clientY-bounds.top)/bounds.height-.5;
          card.style.setProperty("--card-tilt-x",`${-y*4}deg`);
          card.style.setProperty("--card-tilt-y",`${x*4}deg`);
        },{passive:true});
        card.addEventListener("pointerleave",()=>{
          card.style.removeProperty("--card-tilt-x");
          card.style.removeProperty("--card-tilt-y");
        },{passive:true});
      });
    }
  }
})();