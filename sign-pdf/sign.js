(() => {
  "use strict";
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const state = {file:null, pdf:null, pdfLibDoc:null, pages:[], current:0, rotations:{}, elements:[], selected:null, zoom:1, fitScale:1, signature:null, history:[], future:[], clipboard:null};
  pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  function setStatus(message,error=false){const el=$("#signStatus");el.textContent=message;el.classList.toggle("error",error)}
  function safeName(name){return name.replace(/\.pdf$/i,"").replace(/[^a-z0-9_-]+/gi,"_").slice(0,60)||"document"}
  function showStage(stage){["#uploadStage","#signatureStage","#editorStage"].forEach(id=>$(id).classList.toggle("hidden",id!==stage));}

  // Upload
  const drop=$("#signDropzone"), input=$("#signFileInput");
  drop.addEventListener("click",()=>input.click());drop.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();input.click()}});
  ["dragenter","dragover"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add("dragover")}));
  ["dragleave","drop"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove("dragover")}));
  drop.addEventListener("drop",e=>acceptFile(e.dataTransfer.files[0]));input.addEventListener("change",()=>acceptFile(input.files[0]));

  async function acceptFile(file){
    if(!file)return;if(file.type&&file.type!=="application/pdf"&&!/\.pdf$/i.test(file.name)){setStatus("Please select a PDF file.",true);return}
    state.file=file;setStatus("Loading PDF…");
    try{if(!window.pdfjsLib||!window.PDFLib)throw Error("PDF libraries did not load. Check your connection and reload.");
      let data=await file.arrayBuffer();
      try{state.pdf=await pdfjsLib.getDocument({data:data.slice(0)}).promise}catch(e){if(e?.name==="PasswordException")throw Error("This PDF is password-protected. Unlock it before signing.");throw Error("This PDF is damaged or could not be opened.")}
      state.pdfLibDoc=await PDFLib.PDFDocument.load(data.slice(0));
      state.pages=[];state.rotations={};
      for(let i=1;i<=state.pdf.numPages;i++){const page=await state.pdf.getPage(i);const vp=page.getViewport({scale:1});state.pages.push({width:vp.width,height:vp.height,rotation:page.rotate||0});state.rotations[i-1]=0}
      $("#workspaceTitle").textContent="Create or upload your signature";$("#workspaceDescription").textContent=`${file.name} · ${bytes(file.size)} · ${state.pdf.numPages} page${state.pdf.numPages===1?"":"s"}`;
      showStage("#signatureStage");renderTypedPreviews();
    }catch(e){setStatus(e.message,true)}
  }
  function bytes(n){return n<1048576?`${(n/1024).toFixed(1)} KB`:`${(n/1048576).toFixed(2)} MB`}
  // Signature tabs
  $$('[data-sign-tab]').forEach(btn=>btn.addEventListener("click",()=>{$$('[data-sign-tab]').forEach(b=>b.classList.remove("active"));btn.classList.add("active");$$('[data-sign-panel]').forEach(p=>p.classList.toggle("hidden",p.dataset.signPanel!==btn.dataset.signTab))}));

  const fonts=["cursive","Georgia","Brush Script MT","Times New Roman"];
  function renderTypedPreviews(){const box=$("#typedPreviews");box.replaceChildren();fonts.forEach((font,i)=>{const c=document.createElement("button");c.type="button";c.className=i===0?"typed-preview selected":"typed-preview";c.dataset.font=font;c.textContent=$("#typedName").value||"Your Name";c.style.fontFamily=font;box.append(c);c.addEventListener("click",()=>{$$(".typed-preview").forEach(x=>x.classList.remove("selected"));c.classList.add("selected")})})}
  $("#typedName").addEventListener("input",()=>$$('.typed-preview').forEach(p=>p.textContent=$("#typedName").value||"Your Name"));

  // Drawing canvas
  const draw=$("#drawCanvas"),ctx=draw.getContext("2d");let drawing=false,last=null,strokes=[];
  ctx.lineCap="round";ctx.lineJoin="round";
  function point(e){const r=draw.getBoundingClientRect();return{x:(e.clientX-r.left)*(draw.width/r.width),y:(e.clientY-r.top)*(draw.height/r.height)}}
  function begin(e){e.preventDefault();drawing=true;last=point(e);const stroke={color:$("#penColor").value,width:Number($("#penWidth").value)*2,points:[last]};strokes.push(stroke)}
  function move(e){if(!drawing)return;const p=point(e),s=strokes.at(-1);s.points.push(p);ctx.strokeStyle=s.color;ctx.lineWidth=s.width;ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();last=p}
  function end(){drawing=false}
  draw.addEventListener("pointerdown",begin);draw.addEventListener("pointermove",move);draw.addEventListener("pointerup",end);draw.addEventListener("pointerleave",end);
  $("#clearDraw").addEventListener("click",()=>{strokes=[];ctx.clearRect(0,0,draw.width,draw.height)});
  $("#undoDraw").addEventListener("click",()=>{strokes.pop();ctx.clearRect(0,0,draw.width,draw.height);strokes.forEach(s=>{ctx.strokeStyle=s.color;ctx.lineWidth=s.width;ctx.beginPath();s.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke()})});

  // Uploaded signature
  $("#signatureUpload").addEventListener("change",async e=>{const f=e.target.files[0];if(!f)return;if(!["image/png","image/jpeg","image/svg+xml"].includes(f.type)&&!/\.(png|jpe?g|svg)$/i.test(f.name)){setStatus("Choose a PNG, JPG, JPEG or SVG signature image.",true);return}await loadImageSignature(f)});
  async function loadImageSignature(file){
    const text= file.type==="image/svg+xml" ? await file.text() : null;if(text && /<script|onload=|onerror=/i.test(text)){setStatus("Unsafe SVG content was rejected.",true);return}
    const url=URL.createObjectURL(file);const img=new Image();img.onload=()=>{const c=$("#uploadedPreview"),x=c.getContext("2d");x.clearRect(0,0,c.width,c.height);const scale=Math.min((c.width-40)/img.width,(c.height-40)/img.height);const w=img.width*scale,h=img.height*scale;x.drawImage(img,(c.width-w)/2,(c.height-h)/2,w,h);URL.revokeObjectURL(url);state.signature=c.toDataURL("image/png")};img.onerror=()=>{URL.revokeObjectURL(url);setStatus("Could not read that signature image.",true)};img.src=url;
  }

  $("#cancelSignature").addEventListener("click",()=>showStage("#uploadStage"));
  $("#saveSignature").addEventListener("click",async()=>{
    const tab=$('[data-sign-tab].active').dataset.signTab;
    if(tab==="type"){
      const name=$("#typedName").value.trim();if(!name){setStatus("Enter a name for your typed signature.",true);return}const p=$('.typed-preview.selected')||$('.typed-preview');const c=document.createElement("canvas");c.width=900;c.height=220;const x=c.getContext("2d");x.clearRect(0,0,c.width,c.height);x.fillStyle=$("#typedColor").value;x.font=`${$("#typedSize").value*2}px ${p?.dataset.font||"cursive"}`;x.textBaseline="middle";x.fillText(name,20,110);state.signature=c.toDataURL("image/png");
    }else if(tab==="draw"){
      if(!strokes.length){setStatus("Draw a signature before continuing.",true);return}state.signature=draw.toDataURL("image/png");
    }else if(!state.signature){setStatus("Upload a signature image before continuing.",true);return}
    setStatus("");await openEditor();
  });

  // Editor
  async function openEditor(){showStage("#editorStage");$("#workspaceTitle").textContent="Place your signing elements";$("#workspaceDescription").textContent="Drag elements on the page. Use the properties panel for exact placement.";await renderAllThumbnails();await renderPage()}
  async function renderAllThumbnails(){const panel=$("#thumbnailPanel");panel.replaceChildren();for(let i=1;i<=state.pdf.numPages;i++){const page=await state.pdf.getPage(i);const vp=page.getViewport({scale:.12,rotation:state.rotations[i-1]});const c=document.createElement("canvas");c.width=vp.width;c.height=vp.height;await page.render({canvasContext:c.getContext("2d"),viewport:vp}).promise;const wrap=document.createElement("button");wrap.className="thumbnail"+(i-1===state.current?" active":"");wrap.append(c);wrap.title=`Page ${i}`;wrap.addEventListener("click",()=>{state.current=i-1;renderPage();renderAllThumbnails()});panel.append(wrap)}}

  async function renderPage(){
    const i=state.current+1,page=await state.pdf.getPage(i),rotation=state.rotations[state.current]||0;
    const base=page.getViewport({scale:1,rotation});
    const panel=$("#pageScroll");const available=Math.max(400,panel.clientWidth-60);const fit=Math.min((available/base.width),($("#pageScroll").clientHeight-60)/base.height,1.5);state.fitScale=fit;
    const scale=state.zoom===1?fit:fit*state.zoom;const vp=page.getViewport({scale,rotation});const c=$("#pdfCanvas");c.width=vp.width;c.height=vp.height;c.style.width=`${vp.width}px`;c.style.height=`${vp.height}px`;await page.render({canvasContext:c.getContext("2d"),viewport:vp}).promise;
    const stage=$("#pageStage");stage.style.width=`${vp.width}px`;stage.style.height=`${vp.height}px`;$("#elementLayer").style.width=`${vp.width}px`;$("#elementLayer").style.height=`${vp.height}px`;
    $("#pageIndicator").textContent=`${i} / ${state.pdf.numPages}`;renderElements();
  }
  $("#prevPage").onclick=()=>{if(state.current>0){state.current--;state.zoom=1;renderPage();renderAllThumbnails()}};
  $("#nextPage").onclick=()=>{if(state.current<state.pdf.numPages-1){state.current++;state.zoom=1;renderPage();renderAllThumbnails()}};
  $("#zoomIn").onclick=()=>{state.zoom=Math.min(3,state.zoom*1.2);renderPage()};$("#zoomOut").onclick=()=>{state.zoom=Math.max(.5,state.zoom/1.2);renderPage()};$("#fitPage").onclick=()=>{state.zoom=1;renderPage()};
  $("#rotatePage").onclick=()=>{pushHistory();state.rotations[state.current]=(state.rotations[state.current]+90)%360;renderPage();renderAllThumbnails()};

  function snapshot(){return JSON.stringify({elements:state.elements,rotations:state.rotations})}
  function pushHistory(){state.history.push(snapshot());if(state.history.length>50)state.history.shift();state.future=[]}
  function restore(s){const v=JSON.parse(s);state.elements=v.elements;state.rotations=v.rotations||{};state.selected=null;renderElements();renderAllThumbnails();renderPage()}
  $("#undoAction").onclick=()=>{if(!state.history.length)return;state.future.push(snapshot());restore(state.history.pop())};
  $("#redoAction").onclick=()=>{if(!state.future.length)return;state.history.push(snapshot());restore(state.future.pop())};

  function addElement(type){pushHistory();const names={initials:"AB",name:"Your Name",date:"DD/MM/YYYY",text:"Approved"};const el={id:crypto.randomUUID(),type,page:state.current,x:.35,y:.35,w:type==="signature"?.24:.18,h:type==="signature"?.08:.05,text:names[type]||"",fontSize:18,color:"#17233d",opacity:1,rotation:0,dateFormat:"DD/MM/YYYY",data:state.signature};if(type==="date")el.text=formattedDate(el.dateFormat);if(type==="text")el.text="Approved";state.elements.push(el);state.selected=el.id;renderElements();renderProperties()}
  $$('[data-add]').forEach(b=>b.addEventListener("click",()=>addElement(b.dataset.add)));

  function formattedDate(format){const d=new Date(),dd=String(d.getDate()).padStart(2,"0"),mm=String(d.getMonth()+1).padStart(2,"0"),yyyy=d.getFullYear();return format==="MM/DD/YYYY"?`${mm}/${dd}/${yyyy}`:format==="YYYY-MM-DD"?`${yyyy}-${mm}-${dd}`:`${dd}/${mm}/${yyyy}`}

  function renderElements(){
    const layer=$("#elementLayer");layer.replaceChildren();const stageRect=layer.getBoundingClientRect();
    state.elements.filter(e=>e.page===state.current).forEach(el=>{const div=document.createElement("div");div.className="sign-element"+(state.selected===el.id?" selected":"");div.style.left=`${el.x*100}%`;div.style.top=`${el.y*100}%`;div.style.width=`${el.w*100}%`;div.style.height=`${el.h*100}%`;div.style.opacity=el.opacity;div.style.transform=`rotate(${el.rotation}deg)`;
      if(el.type==="signature"||el.type==="initials"&&el.data){if(el.type==="signature"&&el.data){const img=new Image();img.src=el.data;div.append(img)}else div.textContent=el.text}else div.textContent=el.text;
      div.style.color=el.color;div.style.fontSize=`${Math.max(8,el.fontSize*(stageRect.width/600))}px`;
      div.addEventListener("pointerdown",e=>beginDrag(e,el));const handle=document.createElement("span");handle.className="resize-handle";handle.addEventListener("pointerdown",e=>beginResize(e,el));div.append(handle);layer.append(div)});
    $("#elementCount").textContent=`${state.elements.length} element${state.elements.length===1?"":"s"}`;
  }

  function beginDrag(e,el){if(e.target.classList.contains("resize-handle"))return;e.preventDefault();pushHistory();state.selected=el.id;renderElements();renderProperties();const start={x:e.clientX,y:e.clientY,elX:el.x,elY:el.y},layer=$("#elementLayer");const moveEv=x=>{el.x=Math.max(0,Math.min(1-el.w,(start.elX+(x.clientX-start.x)/layer.clientWidth)));el.y=Math.max(0,Math.min(1-el.h,(start.elY+(x.clientY-start.y)/layer.clientHeight)));renderElements()};const up=()=>{window.removeEventListener("pointermove",moveEv);window.removeEventListener("pointerup",up)};window.addEventListener("pointermove",moveEv);window.addEventListener("pointerup",up)}
  function beginResize(e,el){e.preventDefault();pushHistory();const start={x:e.clientX,y:e.clientY,w:el.w,h:el.h},layer=$("#elementLayer");const moveEv=x=>{const ratio=el.w/el.h;let w=Math.max(.04,Math.min(1-el.x,start.w+(x.clientX-start.x)/layer.clientWidth));let h=w/ratio;el.w=w;el.h=Math.min(1-el.y,h);renderElements()};const up=()=>{window.removeEventListener("pointermove",moveEv);window.removeEventListener("pointerup",up)};window.addEventListener("pointermove",moveEv);window.addEventListener("pointerup",up)}

  function renderProperties(){const panel=$("#propertiesPanel"),el=state.elements.find(e=>e.id===state.selected);if(!el){panel.innerHTML='<h3>Properties</h3><p class="muted">Select an element to edit it.</p>';return}
    panel.innerHTML=`<h3>Properties</h3><div class="property-grid"><label>X (%)<input data-prop="x" type="number" min="0" max="100" step="1" value="${Math.round(el.x*100)}"></label><label>Y (%)<input data-prop="y" type="number" min="0" max="100" step="1" value="${Math.round(el.y*100)}"></label><label>Width (%)<input data-prop="w" type="number" min="2" max="100" step="1" value="${Math.round(el.w*100)}"></label><label>Height (%)<input data-prop="h" type="number" min="2" max="100" step="1" value="${Math.round(el.h*100)}"></label><label>Rotation<input data-prop="rotation" type="number" min="-360" max="360" value="${el.rotation}"></label><label>Opacity<input data-prop="opacity" type="range" min="0.1" max="1" step="0.1" value="${el.opacity}"></label><label>Font size<input data-prop="fontSize" type="number" min="6" max="72" value="${el.fontSize}"></label><label>Text color<input data-prop="color" type="color" value="${el.color}"></label>${el.type==="date"?'<label>Date format<select data-prop="dateFormat"><option>DD/MM/YYYY</option><option>MM/DD/YYYY</option><option>YYYY-MM-DD</option></select></label>':''}<label class="property-wide">Text<input data-prop="text" type="text" value="${el.text.replace(/"/g,'&quot;')}"></label></div><div class="property-actions"><button id="duplicateElement" type="button">Duplicate</button><button id="deleteElement" type="button">Delete</button></div>`;
    if(el.type==="date")panel.querySelector('[data-prop="dateFormat"]').value=el.dateFormat;
    panel.querySelectorAll('[data-prop]').forEach(input=>input.addEventListener("change",()=>{pushHistory();const prop=input.dataset.prop,number=["x","y","w","h","rotation","opacity","fontSize"].includes(prop);let value=number?Number(input.value):input.value;if(prop==="x"||prop==="y")value/=100;if(prop==="w"||prop==="h")value/=100;if(prop==="dateFormat")el.text=formattedDate(value);el[prop]=value;if(prop==="opacity"||prop==="rotation"){};renderElements();if(prop==="dateFormat")renderProperties()}));
    $("#deleteElement").onclick=()=>{pushHistory();state.elements=state.elements.filter(e=>e.id!==el.id);state.selected=null;renderElements();renderProperties()};$("#duplicateElement").onclick=()=>{pushHistory();const copy={...el,id:crypto.randomUUID(),x:Math.min(.9,el.x+.03),y:Math.min(.9,el.y+.03)};state.elements.push(copy);state.selected=copy.id;renderElements();renderProperties()};
  }
  $("#elementLayer").addEventListener("pointerdown",e=>{if(e.target===e.currentTarget){state.selected=null;renderElements();renderProperties()}});

  document.addEventListener("keydown",e=>{
    const typing=e.target.matches("input,textarea,select,[contenteditable=true]");if(typing)return;
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"){e.preventDefault();e.shiftKey?$("#redoAction").click():$("#undoAction").click()}else if(e.key==="Delete"&&state.selected){pushHistory();state.elements=state.elements.filter(x=>x.id!==state.selected);state.selected=null;renderElements();renderProperties()}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="c"&&state.selected){state.clipboard=JSON.stringify(state.elements.find(x=>x.id===state.selected))}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="v"&&state.clipboard){pushHistory();const copy=JSON.parse(state.clipboard);copy.id=crypto.randomUUID();copy.page=state.current;copy.x=Math.min(.9,copy.x+.03);copy.y=Math.min(.9,copy.y+.03);state.elements.push(copy);state.selected=copy.id;renderElements();renderProperties()}
  });

  $("#replaceDocument").onclick=()=>{state.file=null;state.pdf=null;state.elements=[];state.signature=null;showStage("#uploadStage");$("#workspaceTitle").textContent="Upload a PDF to begin";$("#workspaceDescription").textContent="Your document stays on your device.";setStatus("")};

  function inverseElement(el,rot,W,H){const x=el.x,y=el.y,w=el.w,h=el.h;let rx=x,ry=y,rw=w,rh=h;
    if(rot===90)return{x:ry*W,y:(1-rx-rw)*H,width:rh*H,height:rw*W};
    if(rot===270)return{x:(1-ry-rh)*W,y:rx*H,width:rh*H,height:rw*W};
    if(rot===180)return{x:(1-x-w)*W,y:(1-y-h)*H,width:w*W,height:h*H};
    return{x:x*W,y:(1-y-h)*H,width:w*W,height:h*H};
  }
  async function generateSigned(preview=false){
    if(!state.elements.length)throw Error("Add at least one signing element before downloading.");setStatus("Preparing signed PDF…");
    const out=await PDFLib.PDFDocument.load(await state.file.arrayBuffer());
    for(let i=0;i<out.getPageCount();i++){
      const page=out.getPage(i),rot=state.rotations[i]||0;if(rot)page.setRotation(PDFLib.degrees((page.getRotation().angle+rot)%360));
      const W=page.getSize().width,H=page.getSize().height;
      for(const el of state.elements.filter(e=>e.page===i)){const m=inverseElement(el,rot,W,H);
        if(el.type==="signature"&&el.data){const img=await out.embedPng(el.data);page.drawImage(img,{x:m.x,y:m.y,width:m.width,height:m.height,opacity:el.opacity,rotate:PDFLib.degrees(el.rotation)})}
        else{const text=el.type==="date"?formattedDate(el.dateFormat):el.text||"";const color=hex(el.color);page.drawText(text,{x:m.x,y:m.y,size:el.fontSize,opacity:el.opacity,color:color,rotate:PDFLib.degrees(el.rotation)})}
      }
    }
    const bytes=await out.save();const blob=new Blob([bytes],{type:"application/pdf"});const url=URL.createObjectURL(blob);if(preview){window.open(url,"_blank");setStatus("Preview opened. You can close it and download when ready.");setTimeout(()=>URL.revokeObjectURL(url),60000);return null}return blob;
  }
  function hex(v){const n=parseInt(v.slice(1),16);return PDFLib.rgb(((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255)}
  $("#previewSigned").onclick=async()=>{try{await generateSigned(true)}catch(e){setStatus(e.message,true)}};
  $("#downloadSigned").onclick=async()=>{try{const blob=await generateSigned(false);if(!blob)return;const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`${safeName(state.file.name)}-signed.pdf`;document.body.append(a);a.click();a.remove();setStatus("Signed PDF downloaded.");setTimeout(()=>URL.revokeObjectURL(url),60000)}catch(e){setStatus(e.message,true)}};

  $("#menuToggle").addEventListener("click",()=>$(".topnav").classList.toggle("open"));
})();
