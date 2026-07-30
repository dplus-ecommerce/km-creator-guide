// Supabase data layer for the Creator Product Guide (public + admin).
// Replaces the old localStorage store: brief overrides + gallery records now
// live in the shared KM Supabase project, table `creator_brief` (one row per
// product; a row/column is present only when แอล has overridden the default).
// No login (แอล's choice): anon may read + write THIS table only.
(function(){
  if (window.KM_SB) return;
  var URL   = 'https://axwkuiyrdcmeefeddpex.supabase.co';
  var KEY   = 'sb_publishable_-YS44F67cIKeC4tx-4nfRw_R2KFxHqq';
  var TABLE = 'creator_brief';

  // component-edit key  ->  DB column
  var COLS = {
    keymsg:'keymsg', features:'features', ingredients:'ingredients',
    suitable:'suitable', content:'content', scenes:'scenes', refs:'refs',
    hashtags:'hashtags', doList:'do_list', dontList:'dont_list', link:'link',
    // product-fact overrides (fall back to products.js when null)
    thaiName:'thai_name', enName:'en_name', claim:'claim', net:'net',
    intro:'intro', howto:'howto', caution:'caution'
  };

  function headers(extra){
    return Object.assign({ apikey:KEY, Authorization:'Bearer '+KEY, 'Content-Type':'application/json' }, extra||{});
  }
  function nowIso(){ try { return new Date().toISOString(); } catch(_){ return null; } }

  // เนื้อหาระดับหน้าเว็บ (hero / about / why / faq / footer …) เก็บในแถวพิเศษ
  // product_id = '__site__' คอลัมน์ gallery (jsonb) — ไม่ต้องเพิ่มคอลัมน์ใหม่ในตาราง
  var SITE_ID = '__site__';

  // ---- read: build the same {edits, gallery} maps the pages used from localStorage
  async function load(){
    var edits = {}, gallery = {}, site = null;
    try {
      var r = await fetch(URL+'/rest/v1/'+TABLE+'?select=*', { headers: headers() });
      if (r.ok) {
        var rows = await r.json();
        rows.forEach(function(row){
          if (row.product_id === SITE_ID) { site = row.gallery || null; return; }
          var id = row.product_id, e = {};
          Object.keys(COLS).forEach(function(k){
            var v = row[COLS[k]];
            if (v != null && v !== '') e[k] = v;
          });
          if (Object.keys(e).length) edits[id] = e;
          if (row.gallery != null) gallery[id] = row.gallery;
        });
      }
    } catch(err){ console.warn('KM_SB.load failed', err); }
    return { edits: edits, gallery: gallery, site: site };
  }

  // ---- write: upsert (INSERT ... ON CONFLICT DO UPDATE of the sent columns only)
  function upsert(id, patch){
    var body = Object.assign({ product_id:id, updated_at:nowIso() }, patch);
    return fetch(URL+'/rest/v1/'+TABLE+'?on_conflict=product_id', {
      method:'POST',
      headers: headers({ Prefer:'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(body)
    });
  }

  // debounce writes per product so typing doesn't fire a request per keystroke
  var pend = {}, timer = {};
  function flush(id){
    var patch = pend[id]; pend[id] = null;
    if (patch && Object.keys(patch).length) upsert(id, patch).catch(function(e){ console.warn('KM_SB write', e); });
  }
  function queue(id, patch){
    pend[id] = Object.assign(pend[id] || {}, patch);
    clearTimeout(timer[id]);
    timer[id] = setTimeout(function(){ flush(id); }, 450);
  }

  window.KM_SB = {
    load: load,
    // brief text fields
    saveField:  function(id, key, val){ var p={}; p[COLS[key]||key] = val;  queue(id, p); },
    resetField: function(id, key){       var p={}; p[COLS[key]||key] = null; queue(id, p); },
    resetProduct: function(id){
      clearTimeout(timer[id]); pend[id] = null;
      var p = {}; Object.keys(COLS).forEach(function(k){ p[COLS[k]] = null; });
      return upsert(id, p).catch(function(e){ console.warn('KM_SB resetProduct', e); });
    },
    // gallery record (array of {t:'b',k} | {t:'a',d:'data:...',label})
    saveGallery:  function(id, rec){ queue(id, { gallery: rec }); },
    resetGallery: function(id){      queue(id, { gallery: null }); },
    // เนื้อหาหน้าเว็บทั้งก้อน (แถว __site__) — ส่งทั้ง object ทุกครั้ง
    saveSite:  function(obj){ queue(SITE_ID, { gallery: obj }); },
    resetSite: function(){    clearTimeout(timer[SITE_ID]); pend[SITE_ID] = null; return upsert(SITE_ID, { gallery: null }); },
    // bulk import (restore from a downloaded JSON backup)
    saveAll: function(editsObj){
      Object.keys(editsObj||{}).forEach(function(id){
        var src = editsObj[id] || {}, p = {};
        Object.keys(COLS).forEach(function(k){ p[COLS[k]] = (src[k] != null && src[k] !== '') ? src[k] : null; });
        upsert(id, p).catch(function(e){ console.warn('KM_SB saveAll', e); });
      });
    }
  };
})();
