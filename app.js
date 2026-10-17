(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const fileInput = $("#fileInput"), dropzone = $("#dropzone"), fileList = $("#fileList");
  const optionsBox = $("#toolOptions"), runBtn = $("#runBtn"), status = $("#status"), downloadArea = $("#downloadArea");
  let files = [], activeTool = null, objectUrls = [];
  const toolInfo = {
    merge: ["Merge PDF", "Combine two or more PDFs in the order shown.", "Select at least two PDF files."],
    split: ["Split PDF", "Extract a range of pages into a new PDF.", "Choose one PDF and enter a page range."],
    rotate: ["Rotate PDF", "Rotate every page or a selected page range.", "Choose a PDF and rotation angle."],
    crop: ["Crop PDF", "Trim the visible page area by setting margins in points.", "Choose a PDF and set crop margins. The crop is applied to all pages."],
    jpg: ["PDF to JPG", "Render PDF pages as JPG images and download them individually.", "Choose one PDF. PDF.js is required."],
    jpgpdf: ["JPG to PDF", "Combine JPG or PNG images into a PDF.", "Choose one or more JPG or PNG images."],
    watermark: ["Add watermark", "Place a text watermark on each page.", "Choose a PDF and enter the watermark text."],
    pages: ["Page numbers", "Add page numbers at the bottom of each page.", "Choose a PDF to number."]
  };
  const bytesLabel = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n/1024).toFixed(1)} KB` : `${(n/1048576).toFixed(2)} MB`;
  const safeName = name => name.replace(/\.pdf$/i, "").replace(/[^a-z0-9_-]+/gi, "_").slice(0, 60) || "document";
  function setStatus(message, error=false) { status.textContent=message; status.classList.toggle("error",error); }
  function clearDownloads() { objectUrls.forEach(URL.revokeObjectURL); objectUrls=[]; downloadArea.replaceChildren(); }
  function addDownload(blob, filename, label="Download result") {
    const url=URL.createObjectURL(blob); objectUrls.push(url);
    const a=document.createElement("a"); a.href=url; a.download=filename; a.className="download-link"; a.textContent=`↓ ${label}: ${filename}`; downloadArea.append(a);
  }
  function addOption(label, type, name, value, extra={}) {
    const wrap=document.createElement("label"); wrap.textContent=label;
    const input=document.createElement(type==="select"?"select":"input"); input.dataset.option=name;
    if(type==="select"){ extra.choices.forEach(([v,t])=>{const o=document.createElement("option");o.value=v;o.textContent=t;input.append(o);}); input.value=value; }
    else { input.type=type; input.value=value; if(extra.min!==undefined) input.min=extra.min; if(extra.max!==undefined) input.max=extra.max; if(extra.step!==undefined) input.step=extra.step; if(extra.accept) input.accept=extra.accept; }
    wrap.append(input); if(extra.wide) wrap.classList.add("option-wide"); optionsBox.append(wrap);
  }
  function buildOptions() {
    optionsBox.replaceChildren(); optionsBox.classList.add("hidden"); if(!activeTool) return;
    if(activeTool==="split"){addOption("Page range (e.g. 1-3)","text","range","1-1",{wide:true});}
    if(activeTool==="rotate"){addOption("Rotation","select","angle","90",{choices:[["90","90° clockwise"],["180","180°"],["270","270° clockwise"]]});addOption("Page range (blank = all)","text","range","",{wide:true});}
    if(activeTool==="crop"){addOption("Top margin (points)","number","top","20",{min:0,max:10000});addOption("Right margin (points)","number","right","20",{min:0,max:10000});addOption("Bottom margin (points)","number","bottom","20",{min:0,max:10000});addOption("Left margin (points)","number","left","20",{min:0,max:10000});}
    if(activeTool==="watermark"){addOption("Watermark text","text","text","CONFIDENTIAL",{wide:true});}
    if(activeTool==="jpgpdf"){fileInput.accept="image/jpeg,image/png";fileInput.multiple=true;}
    else {fileInput.accept="application/pdf";fileInput.multiple=activeTool==="merge";}
    if(!["merge","jpg","jpgpdf"].includes(activeTool)) addOption("Page range (blank = all, e.g. 1-3)","text","range","",{wide:true});
    optionsBox.classList.remove("hidden");
  }
  function option(name){return optionsBox.querySelector(`[data-option="${name}"]`)?.value ?? "";}
  function parseRange(text,total){
    if(!text.trim()) return Array.from({length:total},(_,i)=>i);
    const out=new Set();
    for(const part of text.split(",")){const m=part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);if(!m)throw Error("Use page numbers like 1-3 or 1,3,5.");let a=Number(m[1]),b=Number(m[2]||m[1]);if(a<1||b<a||b>total)throw Error(`Page range must be between 1 and ${total}.`);for(let n=a;n<=b;n++)out.add(n-1);}
    return [...out].sort((a,b)=>a-b);
  }
  function renderFiles(){
    fileList.replaceChildren();
    files.forEach((f,i)=>{const row=document.createElement("div");row.className="file-row";const icon=document.createElement("span");icon.className="mini-pdf";icon.textContent=f.type.startsWith("image/")?"IMG":"PDF";const info=document.createElement("div");info.className="file-info";const b=document.createElement("b");b.textContent=f.name;const sm=document.createElement("small");sm.textContent=bytesLabel(f.size);info.append(b,sm);const remove=document.createElement("button");remove.className="remove-file";remove.type="button";remove.textContent="Remove";remove.setAttribute("aria-label",`Remove ${f.name}`);remove.onclick=()=>{files.splice(i,1);renderFiles();clearDownloads();};row.append(icon,info,remove);fileList.append(row);});
    runBtn.disabled=!files.length;runBtn.innerHTML=files.length?`Process ${files.length} file${files.length===1?"":"s"} <span>→</span>`:"Choose files first <span>→</span>";
  }
  function chooseTool(tool){
    activeTool=tool; const info=toolInfo[tool]; $("#workspaceTitle").textContent=info[0];$("#workspaceDescription").textContent=info[1];$("#fileHint").textContent=info[2];
    buildOptions(); clearDownloads(); setStatus(""); document.querySelectorAll(".tool-card").forEach(c=>c.classList.toggle("selected",c.dataset.tool===tool));
    if(tool==="jpgpdf") files=[]; renderFiles(); $("#workspace").scrollIntoView({behavior:"smooth",block:"start"});
  }
  document.querySelectorAll(".tool-card").forEach(card=>card.addEventListener("click",()=>chooseTool(card.dataset.tool)));
  document.querySelectorAll(".category").forEach(btn=>btn.addEventListener("click",()=>{document.querySelectorAll(".category").forEach(b=>b.classList.toggle("active",b===btn));filterTools();}));
  $("#toolSearch").addEventListener("input",filterTools);
  function filterTools(){const cat=document.querySelector(".category.active").dataset.category, q=$("#toolSearch").value.toLowerCase();document.querySelectorAll(".tool-card").forEach(c=>{c.classList.toggle("hidden",!(cat==="all"||c.dataset.category===cat)||!c.innerText.toLowerCase().includes(q));});}
  function acceptFiles(selected){
    const chosen=[...selected]; if(!chosen.length)return;
    if(activeTool==="jpgpdf"){const valid=chosen.filter(f=>["image/jpeg","image/png"].includes(f.type));if(valid.length!==chosen.length){setStatus("Please select JPG or PNG images only.",true);return;}files=[...files,...valid];}
    else {const valid=chosen.filter(f=>f.type==="application/pdf"||f.name.toLowerCase().endsWith(".pdf"));if(valid.length!==chosen.length){setStatus("Please select PDF files only.",true);return;}files=activeTool==="merge"?[...files,...valid]:valid.slice(0,1);}
    clearDownloads();setStatus("");renderFiles();
  }
  dropzone.addEventListener("click",()=>fileInput.click());dropzone.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();fileInput.click();}});
  fileInput.addEventListener("change",()=>{acceptFiles(fileInput.files);fileInput.value="";});
  ["dragenter","dragover"].forEach(ev=>dropzone.addEventListener(ev,e=>{e.preventDefault();dropzone.classList.add("dragover");}));
  ["dragleave","drop"].forEach(ev=>dropzone.addEventListener(ev,e=>{e.preventDefault();dropzone.classList.remove("dragover");}));
  dropzone.addEventListener("drop",e=>acceptFiles(e.dataTransfer.files));
  $("#clearBtn").addEventListener("click",()=>{files=[];renderFiles();clearDownloads();setStatus("");});
  $("#menuToggle").addEventListener("click",()=>$(".topnav").classList.toggle("open"));

  async function loadPdf(file){return PDFLib.PDFDocument.load(await file.arrayBuffer());}
  async function process(){
    clearDownloads(); setStatus("Processing…");runBtn.disabled=true;
    try{
      if(!activeTool)throw Error("Choose a tool first.");
      if(!files.length)throw Error("Add files first.");
      if(activeTool==="merge"){
        if(files.length<2)throw Error("Choose at least two PDF files to merge.");
        const out=await PDFLib.PDFDocument.create();
        for(const f of files){const src=await loadPdf(f);const pages=await out.copyPages(src,src.getPageIndices());pages.forEach(p=>out.addPage(p));}
        addDownload(new Blob([await out.save()],{type:"application/pdf"}),"merged.pdf");setStatus("Merge complete.");
      } else if(activeTool==="jpgpdf"){
        const out=await PDFLib.PDFDocument.create();
        for(const f of files){const data=await f.arrayBuffer();const img=f.type==="image/png"?await out.embedPng(data):await out.embedJpg(data);const page=out.addPage([img.width,img.height]);page.drawImage(img,{x:0,y:0,width:img.width,height:img.height});}
        addDownload(new Blob([await out.save()],{type:"application/pdf"}),"images.pdf");setStatus("Image-to-PDF conversion complete.");
      } else if(activeTool==="jpg"){
        if(!window.pdfjsLib)throw Error("PDF.js did not load. Check your internet connection and reload.");
        pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        const pdf=await pdfjsLib.getDocument({data:await files[0].arrayBuffer()}).promise;
        for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i);const viewport=page.getViewport({scale:1.5});const canvas=document.createElement("canvas");canvas.width=viewport.width;canvas.height=viewport.height;await page.render({canvasContext:canvas.getContext("2d"),viewport}).promise;const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.92));addDownload(blob,`${safeName(files[0].name)}-page-${i}.jpg`,`Page ${i}`);canvas.width=canvas.height=0;}
        setStatus(`Rendered ${pdf.numPages} page(s). Download each JPG below.`);
      } else {
        const pdf=await loadPdf(files[0]), pages=pdf.getPages(), indices=parseRange(option("range"),pages.length);
        if(activeTool==="split"){
          const out=await PDFLib.PDFDocument.create();const copied=await out.copyPages(pdf,indices);copied.forEach(p=>out.addPage(p));addDownload(new Blob([await out.save()],{type:"application/pdf"}),`${safeName(files[0].name)}-split.pdf`);setStatus("Page extraction complete.");
        } else {
          if(!indices.length)throw Error("Choose at least one page.");
          if(activeTool==="rotate"){const angle=Number(option("angle"));indices.forEach(i=>pages[i].setRotation(PDFLib.degrees((pages[i].getRotation().angle+angle)%360)));}
          if(activeTool==="crop"){
            const margins={top:Number(option("top")),right:Number(option("right")),bottom:Number(option("bottom")),left:Number(option("left"))};
            if(Object.values(margins).some(n=>!Number.isFinite(n)||n<0))throw Error("Margins must be non-negative numbers.");
            indices.forEach(i=>{const p=pages[i], size=p.getSize(), w=size.width-margins.left-margins.right,h=size.height-margins.top-margins.bottom;if(w<=0||h<=0)throw Error("Crop margins are too large for one or more pages.");p.setCropBox(margins.left,margins.bottom,w,h);});
          }
          if(activeTool==="watermark"){
            const text=option("text").trim();if(!text)throw Error("Enter watermark text.");
            const font=await pdf.embedFont(PDFLib.StandardFonts.Helvetica);
            indices.forEach(i=>{const p=pages[i],size=p.getSize();p.drawText(text,{x:size.width*.12,y:size.height*.5,size:Math.max(18,Math.min(size.width,size.height)*.045),font,color:PDFLib.rgb(.75,.18,.22),opacity:.32,rotate:PDFLib.degrees(30),maxWidth:size.width*.8});});
          }
          if(activeTool==="pages"){
            const font=await pdf.embedFont(PDFLib.StandardFonts.Helvetica);
            indices.forEach(i=>{const p=pages[i],size=p.getSize(),label=String(i+1),fontSize=10;p.drawText(label,{x:(size.width-font.widthOfTextAtSize(label,fontSize))/2,y:18,size:fontSize,font,color:PDFLib.rgb(.25,.28,.35)});});
          }
          const label={rotate:"Rotation",crop:"Crop",watermark:"Watermark",pages:"Page numbering"}[activeTool];
          addDownload(new Blob([await pdf.save()],{type:"application/pdf"}),`${safeName(files[0].name)}-${activeTool}.pdf`);setStatus(`${label} complete.`);
        }
      }
    }catch(err){console.error(err);setStatus(err.message||"Could not process this file. It may be invalid or encrypted.",true);}
    finally{runBtn.disabled=!files.length;runBtn.innerHTML=files.length?`Process ${files.length} file${files.length===1?"":"s"} <span>→</span>`:"Choose files first <span>→</span>";}
  }
  runBtn.addEventListener("click",process);
  chooseTool("merge");
})();