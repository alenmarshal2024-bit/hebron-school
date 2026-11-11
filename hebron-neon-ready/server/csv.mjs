// RFC-4180-like CSV parser, including quoted commas, newlines, escaped quotes,
// and UTF-8 BOM. Import is previewed locally then revalidated on the server.
export function parseCSV(text){
  if(typeof text!=='string'||text.length>4_000_000)throw Error('Invalid or oversized CSV');
  text=text.replace(/^\uFEFF/,'');
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];if(quoted){
      if(c==='"'&&text[i+1]==='"'){cell+='"';i++;}
      else if(c==='"')quoted=false;
      else cell+=c;
    } else if(c==='"') {quoted=true;}
    else if(c===','){row.push(cell);cell='';}
    else if(c==='\r'||c==='\n'){
      if(c==='\r'&&text[i+1]==='\n')i++;
      row.push(cell);if(row.some(x=>x.trim()!==''))rows.push(row);row=[];cell='';
    } else cell+=c;
  }
  if(quoted)throw Error('Unclosed quoted CSV field');
  row.push(cell);if(row.some(x=>x.trim()!==''))rows.push(row);
  return rows;
}
export const COLUMNS=['admission_number','name','class','guardian_name','guardian_phone','preferred_language'];
const ALIASES={admission:'admission_number',admission_no:'admission_number',student_name:'name',class_name:'class',parent_name:'guardian_name',parent_phone:'guardian_phone',phone:'guardian_phone',language:'preferred_language'};
export function rowsFromCsv(text){
  const rows=parseCSV(text);if(!rows.length)throw Error('CSV is empty');
  const headers=rows.shift().map(x=>ALIASES[x.toLowerCase().trim().replace(/[\s-]+/g,'_')]||x.toLowerCase().trim().replace(/[\s-]+/g,'_'));
  const required=['admission_number','name','class'];
  for(const h of required)if(!headers.includes(h))throw Error('Missing column: '+h);
  return rows.map((cells,i)=>({row_number:i+2,...Object.fromEntries(COLUMNS.map(k=>[k,String(cells[headers.indexOf(k)]??'').trim()]))}));
}
export function validateStudent(obj){
  const s={...obj};s.name=String(s.name||'').trim();s.admission_number=String(s.admission_number||'').trim().toUpperCase();s.class=String(s.class||'').trim();s.guardian_name=String(s.guardian_name||'').trim();s.guardian_phone=String(s.guardian_phone||'').trim();s.preferred_language=String(s.preferred_language||'en').toLowerCase();
  if(s.name.length<2||s.name.length>140)return {error:'Student name must be 2–140 characters'};
  if(!/^[A-Z0-9/_-]{2,40}$/.test(s.admission_number))return {error:'Invalid admission number (2–40 letters/numbers)'};
  if(!s.class)return {error:'Class is required'};
  if(s.guardian_phone&&!/^\+?[0-9]{10,15}$/.test(s.guardian_phone.replace(/[\s-]/g,'')))return {error:'Guardian phone must have 10–15 digits'};
  if(!['en','ml'].includes(s.preferred_language))return {error:'Language must be en or ml'};
  return {value:s};
}
export function previewRows(rows,classes, existing=new Set()){
  const lookup=new Map(classes.map(c=>[c.name.toLowerCase(),c.id])); const seen=new Set(existing);
  return rows.map(row=>{const v=validateStudent(row);let error=v.error;
    if(!error&&!lookup.has(v.value.class.toLowerCase()))error='Class not found';
    if(!error&&seen.has(v.value.admission_number))error='Duplicate admission number';
    if(!error)seen.add(v.value.admission_number);
    return {...row,valid:!error,error:error||null,class_id:!error?lookup.get(v.value.class.toLowerCase()):null};
  });
}
