let db={customers:[],visits:[],payments:[]};
let tempPhotos=[];let selectedPaymentMethod='bar';let map=null;let mapMarkers=[];let currentFilter='all';
const RECENT_DAYS=14;const WARN_DAYS=28;
function init(){
  loadData();detectDuplicates();initSignatureCanvas();setTodayDate();updateHeaderStats();renderRecent();
  if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(e=>console.log('SW:',e));
  document.getElementById('search-input').addEventListener('input',debounce(renderCustomerList,200));
  document.querySelectorAll('.chip').forEach(c=>c.addEventListener('click',()=>{
    document.querySelectorAll('.chip').forEach(x=>x.classList.remove('active'));c.classList.add('active');currentFilter=c.dataset.filter;renderCustomerList();
  }));
}
function loadData(){try{db=JSON.parse(localStorage.getItem('glcrm'))||db;}catch(e){}}
function saveData(){localStorage.setItem('glcrm',JSON.stringify(db));updateHeaderStats();detectDuplicates();}
function clearAllData(){if(confirm('Wirklich ALLES löschen?')){db={customers:[],visits:[],payments:[]};saveData();renderRecent();renderCustomerList();alert('Gelöscht.');}}
function exportData(){const blob=new Blob([JSON.stringify(db,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`glcrm-${new Date().toISOString().slice(0,10)}.json`;a.click();}
function importData(e){const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{db=JSON.parse(r.result);saveData();renderRecent();renderCustomerList();alert('Backup geladen!');}catch(err){alert('Fehler.');}};r.readAsText(f);}
function importCSV(e,type){
  const file=e.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const text=reader.result;const lines=text.split('\n').filter(l=>l.trim());
      if(lines.length<2){alert('CSV ist leer oder ungültig.');return;}
      // parse header
      const parseLine=line=>{const out=[];let cur='',inQ=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){inQ=!inQ;}else if(c===','&&!inQ){out.push(cur.trim());cur='';}else{cur+=c;}}out.push(cur.trim());return out;};
      const headers=parseLine(lines[0]);
      let imported=0;
      for(let i=1;i<lines.length;i++){
        const vals=parseLine(lines[i]);
        if(type==='customers'&&vals.length>=10){
          const c={id:vals[0]||Date.now().toString(36)+Math.random().toString(36).slice(2,6),name:vals[1]||'',shop:vals[2]||'',phone:vals[3]||'',email:vals[4]||'',address:vals[5]||'',lat:parseFloat(vals[6])||null,lng:parseFloat(vals[7])||null,title:vals[8]||'',role:vals[9]||'',recurring:vals[10]||'no',hasStand:vals[11]||'no',stock:parseInt(vals[12])||0,price1:parseFloat(vals[13])||0,price2:parseFloat(vals[14])||0,price3:parseFloat(vals[15])||0,debt:parseFloat(vals[16])||0,favorite:vals[17]==1||vals[17]==='1',lastVisit:vals[18]||null,createdAt:vals[19]||new Date().toISOString(),updatedAt:vals[20]||new Date().toISOString(),photos:[],signature:'',notes:'',bizCards:[],isDuplicate:false};
          const exists=db.customers.some(x=>(c.shop&&x.shop&&x.shop.toLowerCase()===c.shop.toLowerCase())||(c.phone&&x.phone&&x.phone.replace(/\s/g,'')===c.phone.replace(/\s/g,'')&&c.phone)||(c.name&&x.name&&x.name.toLowerCase()===c.name.toLowerCase()));
          if(!exists){db.customers.push(c);imported++;}
        }else if(type==='visits'&&vals.length>=7){
          const v={id:vals[0]||Date.now().toString(36),customerId:vals[1]||'',date:vals[2]||'',type:vals[3]||'präsentation',shop:vals[4]||'',qty:parseInt(vals[5])||0,amount:parseFloat(vals[6])||0,paid:parseFloat(vals[7])||0,unitPrice:parseFloat(vals[8])||0,notes:vals[9]||''};
          db.visits.push(v);imported++;
        }else if(type==='payments'&&vals.length>=5){
          const p={id:vals[0]||Date.now().toString(36),customerId:vals[1]||'',date:vals[2]||'',amount:parseFloat(vals[3])||0,method:vals[4]||'bar',note:vals[5]||''};
          db.payments.push(p);imported++;
        }
      }
      saveData();renderCustomerList();renderRecent();alert(`Importiert: ${imported} ${type}.`);
    }catch(err){alert('Fehler beim CSV-Import: '+err.message);}
  };
  reader.readAsText(file);
  e.target.value='';
}
function showPage(name){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-'+name)?.classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  const idx={home:0,customers:1,visit:2,sync:3,settings:4}[name]??0;
  document.querySelectorAll('.nav-btn')[idx]?.classList.add('active');
  if(name==='home'){renderRecent();setTimeout(initHomeMap,200);setTimeout(renderMonthView,300);}
  if(name==='customers')renderCustomerList();
  if(name==='visit')populateVisitCustomers();
  if(name==='sync')showTable(document.querySelector('.chip[data-table=customers]'),'customers');
}
function daysSince(dateStr){if(!dateStr)return 9999;const d=new Date(dateStr);const now=new Date();return Math.floor((now-d)/(1000*60*60*24));}
function getVisitAgeColor(days){if(days<14)return'#2A6B24';if(days<28)return'#C8A059';return'#C0392B';}
function getTierPrice(c,orderNum){if(orderNum<=1&&c.price1)return c.price1;if(orderNum===2&&c.price2)return c.price2;if(orderNum>=3&&c.price3)return c.price3;return c.price1||0;}
function getNextOrderDate(c){if(!c.recurring||c.recurring==='no')return null;const last=db.visits.filter(v=>v.customerId===c.id).sort((a,b)=>b.date>a.date?1:-1)[0];if(!last)return new Date().toISOString().slice(0,10);const d=new Date(last.date);if(c.recurring==='weekly')d.setDate(d.getDate()+7);if(c.recurring==='biweekly')d.setDate(d.getDate()+14);if(c.recurring==='monthly')d.setMonth(d.getMonth()+1);return d.toISOString().slice(0,10);}
function isOverdue(nextDate){if(!nextDate)return false;return new Date(nextDate)<new Date();}
function updateHeaderStats(){
  const total=db.customers.length;const visits=db.visits.length;
  const debt=db.customers.reduce((s,c)=>s+(c.debt||0),0);
  const revenue=db.visits.reduce((s,v)=>s+(v.amount||0),0);
  document.getElementById('stat-total').textContent=total;
  document.getElementById('stat-visits').textContent=visits;
  document.getElementById('stat-debt').textContent=debt.toFixed(2)+'€';
  document.getElementById('stat-revenue').textContent=revenue.toFixed(0)+'€';
}
function renderPerformanceSummary(){
  const el=document.getElementById('perf-summary');if(!el)return;
  const list=db.customers.slice().sort((a,b)=>((b.revenue||0)-(a.revenue||0))).slice(0,6);
  if(!list.length){el.innerHTML='<p style="color:var(--muted)">Noch keine Daten.</p>';return;}
  let html='<div style="display:flex;flex-direction:column;gap:8px;">';
  list.forEach((c,idx)=>{
    const rev=c.revenue||0;const orders=c.orderCount||0;const max=list[0].revenue||1;
    const pct=Math.max(5,(rev/max)*100);
    html+=`<div style="display:flex;align-items:center;gap:10px;font-size:0.9rem;">
      <div style="width:24px;text-align:center;color:var(--muted);">${idx+1}</div>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;justify-content:space-between;"><span>${escapeHtml(c.shop||c.name)}</span><span style="color:var(--gold);">${rev.toFixed(0)}€</span></div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:linear-gradient(90deg,var(--green),var(--gold));"></div></div>
      </div>
      <span class="badge badge-visit">${orders}x</span>
    </div>`;
  });
  html+='</div>';el.innerHTML=html;
}
function renderCustomerList(){
  const q=document.getElementById('search-input').value.toLowerCase();
  let list=db.customers.slice();
  if(q)list=list.filter(c=>[c.name,c.shop,c.address,c.phone].some(v=>(v||'').toLowerCase().includes(q)));
  if(currentFilter==='visited')list=list.filter(c=>db.visits.some(v=>v.customerId===c.id));
  if(currentFilter==='debt')list=list.filter(c=>c.debt>0);
  if(currentFilter==='favorite')list=list.filter(c=>c.favorite);
  if(currentFilter==='stand')list=list.filter(c=>c.hasStand==='yes');
  if(currentFilter==='recurring')list=list.filter(c=>c.recurring&&c.recurring!=='no');
  if(currentFilter==='chef')list=list.filter(c=>c.role==='chef');
  if(currentFilter==='mitarbeiter')list=list.filter(c=>c.role==='mitarbeiter');
  if(currentFilter==='duplicate')list=list.filter(c=>c.isDuplicate);
  const container=document.getElementById('customer-list');
  if(!list.length){container.innerHTML='<div class="empty-state"><div class="big">👤</div><p>Keine Kunden gefunden</p></div>';return;}
  container.innerHTML=list.map(c=>{
    const days=daysSince(c.lastVisit);const color=getVisitAgeColor(days);
    const vc=db.visits.filter(v=>v.customerId===c.id).length;
    const debtClass=c.debt>0?'':'ok';
    const standBadge=c.hasStand==='yes'?'<span class="badge badge-stand">📢 Stand</span>':'';
    const recBadge=c.recurring&&c.recurring!=='no'?'<span class="badge badge-visit">🔄 '+{weekly:'Wö.',biweekly:'2Wo.',monthly:'Mo.'}[c.recurring]+'</span>':'';
    const roleBadge=c.role?'<span class="badge badge-paid">'+{chef:'👑Chef',mitarbeiter:'👤Mitarb.',manager:'📋Mgr',einkauf:'🛒Eink.'}[c.role]+'</span>':'';
    const dupBadge=c.isDuplicate?'<span class="badge badge-debt">⚠️ Dup</span>':'';
    const borderColor=c.isDuplicate?'#C0392B':color;
    return `<div class="customer-item fade-in" onclick="openDetail('${c.id}')" ${c.isDuplicate?'style="border-color:#C0392B;"':''}>
      <div class="avatar" style="border:2px solid ${borderColor};">${c.name.charAt(0).toUpperCase()}</div>
      <div class="customer-info">
        <div class="name">${escapeHtml(c.shop||c.name)} ${standBadge} ${recBadge} ${roleBadge} ${dupBadge}</div>
        <div class="sub">${vc} Besuche · letzter: ${c.lastVisit||'nie'} · <span style="color:${color};">${days} Tage</span></div>
      </div>
      <span class="debt-badge ${debtClass}">${(c.debt||0).toFixed(2)}€</span>
    </div>`;
  }).join('');
}
function renderRecent(){
  const container=document.getElementById('recent-list');
  const recent=db.customers.slice().sort((a,b)=>(b.createdAt>a.createdAt?1:-1)).slice(0,8);
  if(!recent.length){container.innerHTML='<div class="empty-state"><div class="big">🌱</div><p>Noch keine Kunden — drücke +</p></div>';return;}
  container.innerHTML=recent.map(c=>{
    const days=daysSince(c.lastVisit);const color=getVisitAgeColor(days);
    const vc=db.visits.filter(v=>v.customerId===c.id).length;
    return `<div class="customer-item fade-in" onclick="openDetail('${c.id}')">
      <div class="avatar" style="border:2px solid ${color};">${c.name.charAt(0).toUpperCase()}</div>
      <div class="customer-info"><div class="name">${escapeHtml(c.shop||c.name)}</div><div class="sub">${vc} Besuche</div></div>
      <span class="debt-badge ${c.debt>0?'':'ok'}">${(c.debt||0).toFixed(2)}€</span>
    </div>`;
  }).join('');
  renderPerformanceSummary();
}
function openNewCustomer(){
  document.getElementById('customer-form').reset();document.getElementById('customer-form').dataset.editingId='';
  tempPhotos=[];document.getElementById('photo-preview').innerHTML='';document.getElementById('biz-preview').innerHTML='';
  clearSignature();openModal('modal-customer');
}
function saveCustomer(e){
  e.preventDefault();
  const name=document.getElementById('cust-name').value.trim();
  const shop=document.getElementById('cust-shop').value.trim();
  const phone=document.getElementById('cust-phone').value.trim();
  const email=document.getElementById('cust-email').value.trim();
  const address=document.getElementById('cust-address').value.trim();
  // Duplicate check
  const duplicates=db.customers.filter(c=>c.id!==(document.getElementById('customer-form').dataset.editingId||'') && (
    (shop && c.shop && c.shop.toLowerCase()===shop.toLowerCase()) ||
    (phone && c.phone && c.phone.replace(/\s/g,'')===phone.replace(/\s/g,'')) ||
    (name && c.name && c.name.toLowerCase()===name.toLowerCase())
  ));
  if(duplicates.length>0){
    const dupInfo=duplicates.map(d=>`• ${d.shop||d.name} (Tel: ${d.phone||'—'})`).join('\n');
    const proceed=confirm(`⚠️ Mögliches Duplikat gefunden:\n\n${dupInfo}\n\nTrotzdem speichern?`);
    if(!proceed)return;
  }
  const customer={
    id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),
    name:document.getElementById('cust-name').value.trim(),shop:document.getElementById('cust-shop').value.trim(),
    phone:document.getElementById('cust-phone').value.trim(),email:document.getElementById('cust-email').value.trim(),
    address:document.getElementById('cust-address').value.trim(),web:document.getElementById('cust-web').value.trim(),
    recurring:document.getElementById('cust-recurring').value,hasStand:document.getElementById('cust-stand').value,
    title:document.getElementById('cust-title').value,role:document.getElementById('cust-role').value,
    stock:parseInt(document.getElementById('cust-stock').value)||0,
    price1:parseFloat(document.getElementById('cust-price1').value)||0,
    price2:parseFloat(document.getElementById('cust-price2').value)||0,
    price3:parseFloat(document.getElementById('cust-price3').value)||0,
    notes:document.getElementById('cust-notes').value.trim(),
    photos:[...tempPhotos],signature:document.getElementById('signature-canvas').toDataURL('image/png'),
    bizCards:[],
    lat:null,lng:null,debt:0,favorite:false,lastVisit:null,orderCount:0,revenue:0,
    createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),
  };
  db.customers.push(customer);saveData();tempPhotos=[];closeModal('modal-customer');renderCustomerList();renderRecent();showPage('customers');
  if(customer.address)geocodeAddress(customer.address,customer.id);
}
function addPhoto(e){const files=Array.from(e.target.files||[]);files.forEach(file=>{const r=new FileReader();r.onload=()=>{tempPhotos.push(r.result);renderPhotoPreview();};r.readAsDataURL(file);});e.target.value='';}
function renderPhotoPreview(){document.getElementById('photo-preview').innerHTML=tempPhotos.map(p=>`<img src="${p}" onclick="viewPhoto('${p.replace(/'/g,"\\'")}')">`).join('');}
function addBizCard(e){
  const files=Array.from(e.target.files||[]);
  const cid=document.getElementById('customer-form').dataset.editingId;
  if(!cid){alert('Bitte zuerst Kunden speichern.');e.target.value='';return;}
  files.forEach(file=>{
    const r=new FileReader();
    r.onload=()=>{
      const c=db.customers.find(x=>x.id===cid);
      if(c){c.bizCards=c.bizCards||[];c.bizCards.push({data:r.result,addedAt:new Date().toISOString()});c.updatedAt=new Date().toISOString();saveData();renderBizCardPreview(c);}
    };
    r.readAsDataURL(file);
  });
  e.target.value='';
}
function renderBizCardPreview(c){
  const el=document.getElementById('biz-preview');if(!el)return;
  el.innerHTML=(c.bizCards||[]).map((b,i)=>`<div style="position:relative;display:inline-block;margin:4px;"><img src="${b.data}" style="width:120px;height:80px;object-fit:cover;border-radius:8px;border:2px solid var(--border);cursor:pointer;" onclick="viewPhoto('${b.data.replace(/'/g,"\\'")}')"><button onclick="removeBizCard('${c.id}',${i})" style="position:absolute;top:-6px;right:-6px;background:var(--red);color:white;border:none;border-radius:50%;width:20px;height:20px;font-size:0.8rem;cursor:pointer;line-height:1;">×</button><div style="font-size:0.7rem;color:var(--muted);margin-top:2px;">${new Date(b.addedAt).toLocaleDateString('de-DE')}</div></div>`).join('');
}
function removeBizCard(cid,index){
  const c=db.customers.find(x=>x.id===cid);if(!c)return;
  c.bizCards.splice(index,1);c.updatedAt=new Date().toISOString();saveData();renderBizCardPreview(c);
}
function viewPhoto(src){document.getElementById('lightbox-img').src=src;openModal('modal-lightbox');}
function initSignatureCanvas(){
  const canvas=document.getElementById('signature-canvas');let drawing=false;let ctx=canvas.getContext('2d');
  function resize(){const rect=canvas.parentElement.getBoundingClientRect();canvas.width=rect.width;canvas.height=160;ctx.strokeStyle='#1A1A1E';ctx.lineWidth=2.5;ctx.lineCap='round';ctx.lineJoin='round';}
  resize();window.addEventListener('resize',resize);
  function getPos(e){const rect=canvas.getBoundingClientRect();const t=e.touches?e.touches[0]:e;return{x:t.clientX-rect.left,y:t.clientY-rect.top};}
  function start(e){e.preventDefault();drawing=true;const p=getPos(e);ctx.beginPath();ctx.moveTo(p.x,p.y);}
  function move(e){e.preventDefault();if(!drawing)return;const p=getPos(e);ctx.lineTo(p.x,p.y);ctx.stroke();}
  function end(e){e.preventDefault();drawing=false;}
  canvas.addEventListener('mousedown',start);canvas.addEventListener('mousemove',move);canvas.addEventListener('mouseup',end);
  canvas.addEventListener('touchstart',start,{passive:false});canvas.addEventListener('touchmove',move,{passive:false});canvas.addEventListener('touchend',end);
}
function clearSignature(){const c=document.getElementById('signature-canvas');const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);}
function previewGeocode(){const addr=document.getElementById('cust-address').value.trim();if(addr.length<5)return;geocodeAddress(addr,null);}
function openDetail(id){
  const c=db.customers.find(x=>x.id===id);if(!c)return;
  const visits=db.visits.filter(v=>v.customerId===id).sort((a,b)=>b.date>a.date?1:-1);
  const payments=db.payments.filter(p=>p.customerId===id);
  const totalPaid=payments.reduce((s,p)=>s+(p.method==='offen'?0:p.amount),0);
  const totalOwed=visits.reduce((s,v)=>s+(v.amount||0),0);
  const debt=totalOwed-totalPaid;const days=daysSince(c.lastVisit);const color=getVisitAgeColor(days);
  const nextDate=getNextOrderDate(c);const overdue=isOverdue(nextDate);
  document.getElementById('detail-name').textContent=c.shop||c.name;
  const dupCount=getDuplicateCount(c);
  if(dupCount>0){
    const dupList=db.customers.filter(x=>x.id!==c.id&&((c.shop&&x.shop&&x.shop.toLowerCase()===c.shop.toLowerCase())||(c.phone&&x.phone&&x.phone.replace(/\s/g,'')===c.phone.replace(/\s/g,''))||(c.name&&x.name&&x.name.toLowerCase()===c.name.toLowerCase()))).map(x=>`• ${x.shop||x.name} (Tel: ${x.phone||'—'})`).join('\n');
    setTimeout(()=>alert(`⚠️ Mögliche Duplikate (${dupCount}):\n\n${dupList}\n\nBitte prüfe, ob einer davon gelöscht werden kann.`),300);
  }
  const roleIcon={chef:'👑',mitarbeiter:'👤',manager:'📋',einkauf:'🛒'}[c.role]||'';
  const titlePrefix=c.title?c.title+' ':'';
  let html=`<div class="card fade-in"><h3>📋 Kontakt</h3>
    <p><strong>Name:</strong> ${roleIcon} ${titlePrefix?escapeHtml(titlePrefix):''}${escapeHtml(c.name)}</p>
    <p><strong>Laden:</strong> ${escapeHtml(c.shop||'—')}</p>
    ${c.phone?`<p><strong>Tel:</strong> <a href="tel:${c.phone}">${c.phone}</a></p>`:''}
    ${c.email?`<p><strong>E-Mail:</strong> ${escapeHtml(c.email)}</p>`:''}
    ${c.address?`<p><strong>Adresse:</strong> ${escapeHtml(c.address)}</p>`:''}
    ${c.web?`<p><strong>Web:</strong> <a href="${escapeHtml(c.web)}" target="_blank">${escapeHtml(c.web)}</a></p>`:''}
    <p><strong>Bestand:</strong> ${c.stock||0} Fl. · <strong>Preis:</strong> ${c.price1?c.price1.toFixed(2)+'€':'—'}/Fl.</p>
    <p><strong>Schulden:</strong> <span style="color:${debt>0?'#C0392B':'#2A6B24'};font-weight:bold;">${debt.toFixed(2)}€</span></p>
    <p><strong>Performance:</strong> ${visits.length} Besuche · ${totalOwed.toFixed(2)}€ Umsatz · avg ${visits.length?((totalOwed/visits.length)).toFixed(2)+'€':'—'}</p>
    <p style="font-size:0.82rem;color:var(--muted);">Erstellt: ${c.createdAt?new Date(c.createdAt).toLocaleString('de-DE'):'—'} · Aktualisiert: ${c.updatedAt?new Date(c.updatedAt).toLocaleString('de-DE'):'—'}</p>
    ${c.recurring&&c.recurring!=='no'?`<p><strong>Wiederkehrend:</strong> ${{weekly:'Wö.',biweekly:'2Wo.',monthly:'Mon.'}[c.recurring]} ${nextDate?'· Nächster: '+nextDate+(overdue?' <span style="color:#C0392B;">⚠️ Überfällig</span>':''):''}</p>`:''}
    ${c.hasStand==='yes'?'<p><span class="badge badge-stand">📢 Hat Werbestand</span></p>':''}
    ${c.notes?`<p style="color:var(--muted);font-style:italic;">„${escapeHtml(c.notes)}"</p>`:''}
  </div>`;
  html+=`<div style="display:flex;gap:8px;margin-bottom:16px;">
    <button class="btn btn-primary" onclick="payCustomer('${c.id}')" style="flex:1;">💳 Zahlung</button>
    <button class="btn btn-secondary" onclick="toggleFavorite('${c.id}')" style="flex:1;">${c.favorite?'⭐ Entfavorisieren':'⭐ Favorit'}</button>
    <button class="btn btn-secondary" onclick="editCustomer('${c.id}')" style="flex:0.8;padding:10px;">✏️</button>
  </div>`;
  if(c.photos&&c.photos.length)html+=`<div class="detail-section"><h3>📸 Fotos</h3><div class="photo-grid">${c.photos.map(p=>`<img src="${p}" onclick="viewPhoto('${p.replace(/'/g,"\\'")}')">`).join('')}</div></div>`;
  if(c.signature)html+=`<div class="detail-section"><h3>✍️ Unterschrift</h3><img src="${c.signature}" style="width:100%;border-radius:10px;background:white;padding:8px;"></div>`;
  html+=`<div class="detail-section"><h3>📅 Besuchs-Historie (${visits.length})</h3>`;
  if(!visits.length)html+='<p style="color:var(--muted)">Keine.</p>';
  else visits.forEach(v=>{
    const paidHere=payments.filter(p=>p.visitId===v.id).reduce((s,p)=>s+p.amount,0);
    html+=`<div class="visit-item"><div><div class="shop">${escapeHtml(v.shop||'')}</div><div class="date">${v.date} · <span class="badge ${v.type==='bestellung'?'badge-visit':v.type==='lieferung'?'badge-debt':'badge-paid'}">${v.type}</span> · ${v.createdAt?'<span style="color:var(--muted);font-size:0.75rem;">'+new Date(v.createdAt).toLocaleString('de-DE')+'</span>':''}</div>${v.notes?`<div style="font-size:0.85rem;margin-top:4px;">${escapeHtml(v.notes)}</div>`:''}</div><div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;"><div style="text-align:right;font-size:0.85rem;color:var(--muted);">${v.amount?`<div><strong>${v.amount.toFixed(2)}€</strong></div>`:''}${v.qty?`<div>${v.qty} Stk.</div>`:''}${paidHere?`<div style="color:#2A6B24;">+${paidHere.toFixed(2)}€</div>`:''}</div><div style="display:flex;gap:4px;"><button class="btn btn-secondary btn-small" onclick="event.stopPropagation();editVisit('${v.id}')" style="padding:6px 10px;min-height:auto;font-size:0.8rem;">✏️</button><button class="btn btn-danger btn-small" onclick="event.stopPropagation();deleteVisit('${v.id}')" style="padding:6px 10px;min-height:auto;font-size:0.8rem;">🗑️</button></div></div></div>`;
  });
  html+='</div>';
  const pmtList=payments.sort((a,b)=>b.date>a.date?1:-1);
  if(pmtList.length)html+=`<div class="detail-section"><h3>💰 Zahlungen</h3>${pmtList.map(p=>`<div class="visit-item"><div><div class="shop">${{bar:'💵',karte:'💳',ueberweisung:'🏦',offen:'📋'}[p.method]||'💰'} ${p.amount.toFixed(2)}€</div><div class="date">${p.date} ${p.note?'· '+escapeHtml(p.note):''}</div></div></div>`).join('')}</div>`;
  if(c.lat&&c.lng)html+=`<div class="detail-section"><h3>🗺️ Standort</h3><div id="detail-map" style="height:250px;border-radius:10px;"></div></div>`;
  html+=`<button class="btn btn-danger" onclick="deleteCustomer('${c.id}')" style="margin-top:16px;">🗑️ Löschen</button>`;
  document.getElementById('detail-content').innerHTML=html;showPage('detail');
  if(c.lat&&c.lng)setTimeout(()=>{const dm=L.map('detail-map').setView([c.lat,c.lng],15);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OSM'}).addTo(dm);L.marker([c.lat,c.lng]).addTo(dm).bindPopup(escapeHtml(c.shop||c.name)).openPopup();},100);
}
function deleteCustomer(id){if(!confirm('Löschen?'))return;db.customers=db.customers.filter(c=>c.id!==id);db.visits=db.visits.filter(v=>v.customerId!==id);db.payments=db.payments.filter(p=>p.customerId!==id);saveData();showPage('customers');renderCustomerList();}
function toggleFavorite(id){const c=db.customers.find(x=>x.id===id);if(c){c.favorite=!c.favorite;saveData();openDetail(id);}}
function populateVisitCustomers(){
  const sel=document.getElementById('visit-customer');sel.innerHTML='<option value="">— Kunde —</option>'+db.customers.map(c=>`<option value="${c.id}">${escapeHtml(c.shop||c.name)}</option>`).join('');
  setTodayDate();
}
function onVisitCustomerChange(){
  const cid=document.getElementById('visit-customer').value;const c=db.customers.find(x=>x.id===cid);
  const hint=document.getElementById('price-hint');const priceInput=document.getElementById('visit-unit-price');
  if(!c||!cid){hint.textContent='';priceInput.value='';return;}
  const orderNum=(c.orderCount||0)+1;let tierPrice=getTierPrice(c,orderNum);
  priceInput.placeholder=tierPrice?tierPrice.toFixed(2)+'€ (Staffel '+orderNum+')':'Auto';
  hint.textContent=`Bisher ${c.orderCount||0} Bestellungen · Staffelpreis ${orderNum}: ${tierPrice?tierPrice.toFixed(2)+'€':'nicht gesetzt'}`;
}
function saveVisit(e){
  e.preventDefault();
  const cid=document.getElementById('visit-customer').value;const c=db.customers.find(x=>x.id===cid);
  const visit={
    id:Date.now().toString(36),customerId:cid,date:document.getElementById('visit-date').value,
    type:document.getElementById('visit-type').value,shop:document.getElementById('visit-shop').value.trim(),
    qty:parseInt(document.getElementById('visit-qty').value)||0,
    amount:parseFloat(document.getElementById('visit-amount').value)||0,
    paid:parseFloat(document.getElementById('visit-paid').value)||0,
    notes:document.getElementById('visit-notes').value.trim(),unitPrice:parseFloat(document.getElementById('visit-unit-price').value)||0,
    createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()
  };
  db.visits.push(visit);
  if(c){
    c.debt=(c.debt||0)+(visit.amount-visit.paid);c.lastVisit=visit.date;c.orderCount=(c.orderCount||0)+(visit.type==='bestellung'?1:0);c.revenue=(c.revenue||0)+(visit.amount||0);
    saveData();
  }
  document.getElementById('visit-form').reset();setTodayDate();alert('Gespeichert!');updateHeaderStats();renderRecent();showPage('home');
}
function payCustomer(id){document.getElementById('pay-cust-id').value=id;document.getElementById('pay-amount').value='';document.getElementById('pay-note').value='';selectPaymentByMethod('bar');openModal('modal-payment');}
function selectPayment(btn){document.querySelectorAll('.pay-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');selectedPaymentMethod=btn.dataset.method;}
function selectPaymentByMethod(m){selectedPaymentMethod=m;document.querySelectorAll('.pay-btn').forEach(b=>b.classList.toggle('selected',b.dataset.method===m));}
function savePayment(e){
  e.preventDefault();
  const payment={
    id:Date.now().toString(36),customerId:document.getElementById('pay-cust-id').value,amount:parseFloat(document.getElementById('pay-amount').value)||0,
    method:selectedPaymentMethod,note:document.getElementById('pay-note').value.trim(),
    date:new Date().toISOString().slice(0,10),
    createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()
  };
  db.payments.push(payment);
  const c=db.customers.find(x=>x.id===payment.customerId);
  if(c&&payment.method!=='offen')c.debt=Math.max(0,(c.debt||0)-payment.amount);
  saveData();closeModal('modal-payment');if(c)openDetail(c.id);updateHeaderStats();
}
function geocodeAddress(address,customerId){
  if(!address)return;
  fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`).then(r=>r.json()).then(data=>{if(data&&data[0]){const c=db.customers.find(x=>x.id===customerId);if(c){c.lat=parseFloat(data[0].lat);c.lng=parseFloat(data[0].lon);saveData();}}}).catch(()=>{});
}
function initHomeMap(){
  const mapEl=document.getElementById('home-map');if(!mapEl||mapEl._leaflet_id)return;
  const coords=db.customers.filter(c=>c.lat&&c.lng);if(!coords.length)return;
  const center=coords.reduce((s,c)=>[s[0]+c.lat,s[1]+c.lng],[0,0]);center[0]/=coords.length;center[1]/=coords.length;
  map=L.map('home-map').setView(center,11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OSM'}).addTo(map);
  db.customers.filter(c=>c.lat&&c.lng).forEach(c=>{
    const days=daysSince(c.lastVisit);const color=getVisitAgeColor(days);
    L.circleMarker([c.lat,c.lng],{radius:8,fillColor:color,color:'#fff',weight:2,fillOpacity:0.9}).addTo(map).bindPopup(`<b>${escapeHtml(c.shop||c.name)}</b><br>${days} Tage<br>${(c.debt||0).toFixed(2)}€ offen<br>${c.hasStand==='yes'?'<span style="color:#D35400;">📢 Stand</span>':''}`);
  });
}
function openModal(id){document.getElementById(id).classList.add('open');}
function closeModal(id){document.getElementById(id).classList.remove('open');}
document.querySelectorAll('.modal-overlay').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('open');}));
function escapeHtml(s){if(!s)return'';return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function setTodayDate(){const el=document.getElementById('visit-date');if(el)el.value=new Date().toISOString().slice(0,10);}
function debounce(fn,ms){let t;return(...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),ms);};}
function exportCSV(type){
  let blob,filename;
  if(type==='customers'||type==='all'){
    const headers=['ID','Name','Laden','Telefon','E-Mail','Adresse','Lat','Lng','Titel','Rolle','Wiederkehrend','Stand','Bestand','Preis1','Preis2','Preis3','Schulden','Favorit','LetzterBesuch','Erstellt','Aktualisiert'];
    const rows=db.customers.map(c=>[c.id,c.name,c.shop,c.phone,c.email,c.address,c.lat,c.lng,c.title,c.role,c.recurring,c.hasStand,c.stock,c.price1,c.price2,c.price3,c.debt,c.favorite?1:0,c.lastVisit,c.createdAt,c.updatedAt].map(x=>`"${x}"`).join(','));
    const csv=[headers.join(','),...rows].join('\n');blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});filename='kunden.csv';
    if(type==='all')downloadBlob(blob,filename);
  }
  if(type==='visits'||type==='all'){
    const headers=['ID','KundeID','Datum','Typ','Shop','Anzahl','Umsatz','Bezahlt','Stückpreis','Notizen'];
    const rows=db.visits.map(v=>[v.id,v.customerId,v.date,v.type,v.shop,v.qty,v.amount,v.paid,v.unitPrice||0,v.notes].map(x=>`"${x}"`).join(','));
    const csv=[headers.join(','),...rows].join('\n');
    const blob2=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
    if(type==='all'){downloadBlob(blob2,'besuche.csv');return;}
    blob=blob2;filename='besuche.csv';
  }
  if(type==='payments'||type==='all'){
    const headers=['ID','KundeID','Datum','Betrag','Methode','Notiz'];
    const rows=db.payments.map(p=>[p.id,p.customerId,p.date,p.amount,p.method,p.note].map(x=>`"${x}"`).join(','));
    const csv=[headers.join(','),...rows].join('\n');
    const blob2=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
    if(type==='all'){downloadBlob(blob2,'zahlungen.csv');return;}
    blob=blob2;filename='zahlungen.csv';
  }
  if(blob)downloadBlob(blob,filename);
}
function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href);}
function syncToSheets(){
  const url=document.getElementById('sync-url').value.trim();const sid=document.getElementById('sync-sheet-id').value.trim();
  const status=document.getElementById('sync-status');
  if(!url&&!sid){status.textContent='Bitte URL oder Sheet ID eingeben.';status.style.color='#C0392B';return;}
  status.textContent='Sende…';status.style.color='var(--gold)';
  const payload={customers:db.customers,visits:db.visits,payments:db.payments,timestamp:new Date().toISOString()};
  if(sid&&!url){url=`https://docs.google.com/spreadsheets/d/${sid}/edit`;status.textContent='Nur Sheet ID — zum Live-Sync brauchst du die Apps Script URL.';status.style.color='#C8A059';return;}
  fetch(url,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).then(()=>{status.textContent='✅ Gesendet — prüfe dein Sheet!';status.style.color='#2A6B24';}).catch(()=>{status.textContent='❌ Fehler — prüfe URL.';status.style.color='#C0392B';});
}
function showTable(chip,type){
  document.querySelectorAll('.chip[data-table]').forEach(c=>c.classList.remove('active'));chip.classList.add('active');
  const container=document.getElementById('table-container');let html='';
  if(type==='customers'){
    html=`<table><thead><tr><th>Laden</th><th>Name</th><th>Ort</th><th>Telefon</th><th>Besuche</th><th>Umsatz</th><th>Schulden</th><th>Letzter</th><th>Wiederkehrend</th><th>Stand</th></tr></thead><tbody>`;
    db.customers.forEach(c=>{
      const vc=db.visits.filter(v=>v.customerId===c.id).length;
      html+=`<tr><td>${escapeHtml(c.shop)}</td><td>${escapeHtml(c.name)}</td><td>${(c.address||'').split(',').slice(-1)[0]}</td><td>${c.phone||''}</td><td>${vc}</td><td>${(c.revenue||0).toFixed(2)}€</td><td style="color:${c.debt>0?'#C0392B':'#2A6B24'};">${(c.debt||0).toFixed(2)}€</td><td>${c.lastVisit||'—'}</td><td>${c.recurring&&c.recurring!=='no'?c.recurring:'—'}</td><td>${c.hasStand==='yes'?'📢':'—'}</td></tr>`;
    });
    html+='</tbody></table>';
  }else if(type==='visits'){
    html=`<table><thead><tr><th>Datum</th><th>Laden</th><th>Typ</th><th>Anzahl</th><th>Umsatz</th><th>Bezahlt</th><th>Notizen</th></tr></thead><tbody>`;
    db.visits.slice().sort((a,b)=>b.date>a.date?1:-1).forEach(v=>{
      html+=`<tr><td>${v.date}</td><td>${escapeHtml(v.shop)}</td><td><span class="badge ${v.type==='bestellung'?'badge-visit':v.type==='lieferung'?'badge-debt':'badge-paid'}">${v.type}</span></td><td>${v.qty||0}</td><td>${(v.amount||0).toFixed(2)}€</td><td>${(v.paid||0).toFixed(2)}€</td><td>${(v.notes||'').slice(0,50)}</td></tr>`;
    });
    html+='</tbody></table>';
  }else if(type==='payments'){
    html=`<table><thead><tr><th>Datum</th><th>Laden</th><th>Betrag</th><th>Methode</th><th>Notiz</th></tr></thead><tbody>`;
    db.payments.slice().sort((a,b)=>b.date>a.date?1:-1).forEach(p=>{
      const c=db.customers.find(x=>x.id===p.customerId);
      html+=`<tr><td>${p.date}</td><td>${c?escapeHtml(c.shop||c.name):'?'}</td><td>${p.amount.toFixed(2)}€</td><td>${{bar:'💵',karte:'💳',ueberweisung:'🏦',offen:'📋'}[p.method]||p.method}</td><td>${escapeHtml(p.note)}</td></tr>`;
    });
    html+='</tbody></table>';
  }
  container.innerHTML=html||'<p style="color:var(--muted)">Keine Daten.</p>';
}
function detectDuplicates(){
  const groups={};
  db.customers.forEach(c=>{
    const keys=[];
    if(c.shop)keys.push('shop_'+c.shop.toLowerCase().trim());
    if(c.phone)keys.push('phone_'+c.phone.replace(/\s/g,''));
    if(c.name)keys.push('name_'+c.name.toLowerCase().trim());
    keys.forEach(k=>{
      if(!groups[k])groups[k]=[];
      groups[k].push(c.id);
    });
  });
  // Reset
  db.customers.forEach(c=>c.isDuplicate=false);
  // Mark
  Object.values(groups).forEach(ids=>{
    if(ids.length>1){
      ids.forEach(id=>{
        const c=db.customers.find(x=>x.id===id);
        if(c)c.isDuplicate=true;
      });
    }
  });
}
function getDuplicateCount(c){
  if(!c.isDuplicate)return 0;
  let count=0;
  if(c.shop)count+=db.customers.filter(x=>x.id!==c.id&&x.shop&&x.shop.toLowerCase()===c.shop.toLowerCase()).length;
  if(c.phone)count+=db.customers.filter(x=>x.id!==c.id&&x.phone&&x.phone.replace(/\s/g,'')===c.phone.replace(/\s/g,'')).length;
  if(c.name)count+=db.customers.filter(x=>x.id!==c.id&&x.name&&x.name.toLowerCase()===c.name.toLowerCase()).length;
  return count;
}
function renderMonthView(){
  const container=document.getElementById('month-table');const chips=document.getElementById('month-chips');
  if(!container||!chips)return;
  const months=[];
  const now=new Date();
  for(let i=0;i<6;i++){const d=new Date(now.getFullYear(),now.getMonth()-i,1);months.push({key:d.toISOString().slice(0,7),label:d.toLocaleDateString('de-DE',{month:'long',year:'numeric'})});}
  chips.innerHTML=months.map((m,i)=>`<div class="chip ${i===0?'active':''}" data-month="${m.key}" onclick="renderMonthTable(this,'${m.key}')">${m.label}</div>`).join('');
  renderMonthTable(chips.querySelector('.chip'),months[0].key);
}
function renderMonthTable(chip,monthKey){
  document.querySelectorAll('#month-chips .chip').forEach(c=>c.classList.remove('active'));if(chip)chip.classList.add('active');
  const container=document.getElementById('month-table');
  const visits=db.visits.filter(v=>v.date&&v.date.startsWith(monthKey)).sort((a,b)=>b.date>a.date?1:-1);
  const customers=db.customers.slice();
  if(!visits.length){container.innerHTML='<p style="color:var(--muted);padding:10px;">Keine Buchungen in diesem Monat.</p>';return;}
  const dayMap={};
  visits.forEach(v=>{
    if(!dayMap[v.date])dayMap[v.date]={date:v.date,visits:[],total:0,qty:0,paid:0};
    dayMap[v.date].visits.push(v);dayMap[v.date].total+=(v.amount||0);dayMap[v.date].qty+=(v.qty||0);dayMap[v.date].paid+=(v.paid||0);
  });
  const days=Object.values(dayMap).sort((a,b)=>a.date<b.date?1:-1);
  let html='<table><thead><tr><th>Datum</th><th>Buchungen</th><th>Anzahl</th><th>Umsatz</th><th>Bezahlt</th><th>Offen</th><th>Salons</th></tr></thead><tbody>';
  days.forEach(d=>{
    const open=d.total-d.paid;
    const shops=d.visits.map(v=>{const c=customers.find(x=>x.id===v.customerId);return c?escapeHtml(c.shop):'—';}).join(', ');
    html+=`<tr><td><strong>${d.date}</strong></td><td>${d.visits.length}</td><td>${d.qty}</td><td>${d.total.toFixed(2)}€</td><td style="color:#2A6B24;">${d.paid.toFixed(2)}€</td><td style="color:${open>0?'#C0392B':'#2A6B24'};">${open.toFixed(2)}€</td><td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${shops.replace(/"/g,'&quot;')}">${shops}</td></tr>`;
  });
  const totalRev=visits.reduce((s,v)=>s+(v.amount||0),0);
  const totalPaid=visits.reduce((s,v)=>s+(v.paid||0),0);
  html+=`<tr style="background:var(--obsidian-mid);"><td><strong>∑ ${monthKey}</strong></td><td>${visits.length}</td><td>${visits.reduce((s,v)=>s+(v.qty||0),0)}</td><td><strong>${totalRev.toFixed(2)}€</strong></td><td>${totalPaid.toFixed(2)}€</td><td style="color:${totalRev-totalPaid>0?'#C0392B':'#2A6B24'};"><strong>${(totalRev-totalPaid).toFixed(2)}€</strong></td><td>${new Set(visits.map(v=>v.customerId)).size} Salons</td></tr>`;
  html+='</tbody></table>';
  container.innerHTML=html;
}

// ===== OCR =====
function runOCR(e){
  const file=e.target.files[0];if(!file)return;
  const status=document.getElementById('ocr-status');
  const resultEl=document.getElementById('ocr-result');
  status.textContent='🔍 Analysiere Bild…';status.style.color='var(--gold)';resultEl.style.display='none';
  const reader=new FileReader();
  reader.onload=async()=>{
    try{
      if(typeof Tesseract==='undefined'){status.textContent='❌ OCR-Modul nicht geladen — prüfe Internetverbindung.';status.style.color='#C0392B';return;}
      const ocrResult=await Tesseract.recognize(reader.result,'deu+eng',{logger:m=>{if(m.status==='recognizing text'){const pct=Math.round((m.progress||0)*100);status.textContent=`📝 Texterkennung… ${pct}%`;}}});
      const text=ocrResult.data.text.trim();
      document.getElementById('ocr-text').value=text;
      resultEl.style.display='block';status.textContent=`✅ Fertig — ${text.split('\n').length} Zeilen erkannt.`;status.style.color='#2A6B24';
    }catch(err){status.textContent='❌ OCR fehlgeschlagen: '+err.message;status.style.color='#C0392B';}
  };
  reader.readAsDataURL(file);
  e.target.value='';
}
function importOCRText(){
  const text=document.getElementById('ocr-text').value.trim();
  if(!text){alert('Kein Text zum Importieren.');return;}
  const lines=text.split('\n').filter(l=>l.trim());
  let imported=0;
  lines.forEach(line=>{
    // Try to parse structured data: "Name | Laden | Betrag | Datum"
    const parts=line.split('|').map(s=>s.trim()).filter(Boolean);
    if(parts.length>=2){
      const name=parts[0];const shop=parts[1]||name;
      // Check if customer exists
      let c=db.customers.find(x=>x.name===name||x.shop===shop);
      if(!c){
        c={id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),name,shop,phone:'',email:'',address:'',lat:null,lng:null,title:'',role:'',recurring:'no',hasStand:'no',stock:0,price1:0,price2:0,price3:0,debt:0,favorite:false,lastVisit:null,createdAt:new Date().toISOString(),photos:[],signature:'',notes:'',bizCards:[],isDuplicate:false};
        db.customers.push(c);imported++;
      }
      // If there's an amount, create a visit
      const amountStr=parts.find(p=>/^\d+[.,]\d+$/.test(p)||/^\d+$/.test(p));
      if(amountStr){
        const amount=parseFloat(amountStr.replace(',','.'));
        const dateStr=parts.find(p=>/^\d{4}-\d{2}-\d{2}$/.test(p)||/^\d{2}\.\d{2}\.\d{4}$/.test(p))||new Date().toISOString().slice(0,10);
        db.visits.push({id:Date.now().toString(36)+Math.random().toString(36).slice(2,4),customerId:c.id,date:dateStr,type:'bestellung',shop:c.shop,qty:1,amount:amount||0,paid:0,unitPrice:0,notes:'OCR Import'});
        c.orderCount=(c.orderCount||0)+1;c.revenue=(c.revenue||0)+(amount||0);c.debt=(c.debt||0)+(amount||0);c.lastVisit=dateStr;
        imported++;
      }
    }
  });
  saveData();renderCustomerList();renderRecent();detectDuplicates();alert(`OCR Import: ${imported} Einträge erstellt.`);
}

// ===== EDIT CUSTOMER =====
function editCustomer(id){
  const c=db.customers.find(x=>x.id===id);if(!c)return;
  const newName=prompt('Name:',c.name);
  if(newName===null)return;
  const newShop=prompt('Laden / Salon:',c.shop);
  if(newShop===null)return;
  const newPhone=prompt('Telefon:',c.phone||'');
  const newEmail=prompt('E-Mail:',c.email||'');
  const newAddress=prompt('Adresse:',c.address||'');
  const newNotes=prompt('Notizen:',c.notes||'');
  c.name=newName.trim()||c.name;c.shop=newShop.trim()||c.shop;
  c.phone=newPhone?newPhone.trim():c.phone;c.email=newEmail?newEmail.trim():c.email;
  c.address=newAddress?newAddress.trim():c.address;c.notes=newNotes?newNotes.trim():c.notes;
  c.updatedAt=new Date().toISOString();
  saveData();openDetail(id);
}

// ===== EDIT VISIT =====
function editVisit(visitId){
  const v=db.visits.find(x=>x.id===visitId);if(!v)return;
  const newDate=prompt('Datum (YYYY-MM-DD):',v.date);
  if(newDate===null)return;
  const newAmount=prompt('Umsatz (€):',v.amount);
  if(newAmount===null)return;
  const newPaid=prompt('Bezahlt (€):',v.paid);
  const newNotes=prompt('Notizen:',v.notes||'');
  v.date=newDate.trim()||v.date;
  v.amount=parseFloat(newAmount)||0;
  v.paid=newPaid!==null?parseFloat(newPaid):v.paid;
  v.notes=newNotes?newNotes.trim():v.notes;
  v.updatedAt=new Date().toISOString();
  // Recalc customer debt/revenue
  const c=db.customers.find(x=>x.id===v.customerId);
  if(c){const relatedVisits=db.visits.filter(x=>x.customerId===c.id);c.revenue=relatedVisits.reduce((s,x)=>s+(x.amount||0),0);c.debt=relatedVisits.reduce((s,x)=>s+(x.amount||0)-(x.paid||0),0);}
  saveData();openDetail(v.customerId);
}

// ===== DELETE VISIT =====
function deleteVisit(visitId){
  if(!confirm('Besuch wirklich löschen?'))return;
  const v=db.visits.find(x=>x.id===visitId);if(!v)return;
  db.visits=db.visits.filter(x=>x.id!==visitId);
  const c=db.customers.find(x=>x.id===v.customerId);
  if(c){const relatedVisits=db.visits.filter(x=>x.customerId===c.id);c.orderCount=relatedVisits.filter(x=>x.type==='bestellung').length;c.revenue=relatedVisits.reduce((s,x)=>s+(x.amount||0),0);c.debt=relatedVisits.reduce((s,x)=>s+(x.amount||0)-(x.paid||0),0);if(relatedVisits.length)c.lastVisit=relatedVisits.sort((a,b)=>b.date>a.date?1:-1)[0].date;else c.lastVisit=null;}
  saveData();if(c)openDetail(c.id);else{renderCustomerList();showPage('customers');}
}

document.addEventListener('DOMContentLoaded',init);