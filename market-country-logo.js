/* AfriFloW: geographic market emblems. Company logo remains unchanged. */
(function () {
  "use strict";
  var map = Object.create(null);
  "AD:AND,AE:ARE,AF:AFG,AG:ATG,AI:AIA,AL:ALB,AM:ARM,AO:AGO,AQ:ATA,AR:ARG,AS:ASM,AT:AUT,AU:AUS,AW:ABW,AX:ALA,AZ:AZE,BA:BIH,BB:BRB,BD:BGD,BE:BEL,BF:BFA,BG:BGR,BH:BHR,BI:BDI,BJ:BEN,BL:BLM,BM:BMU,BN:BRN,BO:BOL,BQ:BES,BR:BRA,BS:BHS,BT:BTN,BV:BVT,BW:BWA,BY:BLR,BZ:BLZ,CA:CAN,CC:CCK,CD:COD,CF:CAF,CG:COG,CH:CHE,CI:CIV,CK:COK,CL:CHL,CM:CMR,CN:CHN,CO:COL,CR:CRI,CU:CUB,CV:CPV,CW:CUW,CX:CXR,CY:CYP,CZ:CZE,DE:DEU,DJ:DJI,DK:DNK,DM:DMA,DO:DOM,DZ:DZA,EC:ECU,EE:EST,EG:EGY,EH:ESH,ER:ERI,ES:ESP,ET:ETH,FI:FIN,FJ:FJI,FK:FLK,FM:FSM,FO:FRO,FR:FRA,GA:GAB,GB:GBR,GD:GRD,GE:GEO,GF:GUF,GG:GGY,GH:GHA,GI:GIB,GL:GRL,GM:GMB,GN:GIN,GP:GLP,GQ:GNQ,GR:GRC,GS:SGS,GT:GTM,GU:GUM,GW:GNB,GY:GUY,HK:HKG,HM:HMD,HN:HND,HR:HRV,HT:HTI,HU:HUN,ID:IDN,IE:IRL,IL:ISR,IM:IMN,IN:IND,IO:IOT,IQ:IRQ,IR:IRN,IS:ISL,IT:ITA,JE:JEY,JM:JAM,JO:JOR,JP:JPN,KE:KEN,KG:KGZ,KH:KHM,KI:KIR,KM:COM,KN:KNA,KP:PRK,KR:KOR,KW:KWT,KY:CYM,KZ:KAZ,LA:LAO,LB:LBN,LC:LCA,LI:LIE,LK:LKA,LR:LBR,LS:LSO,LT:LTU,LU:LUX,LV:LVA,LY:LBY,MA:MAR,MC:MCO,MD:MDA,ME:MNE,MF:MAF,MG:MDG,MH:MHL,MK:MKD,ML:MLI,MM:MMR,MN:MNG,MO:MAC,MP:MNP,MQ:MTQ,MR:MRT,MS:MSR,MT:MLT,MU:MUS,MV:MDV,MW:MWI,MX:MEX,MY:MYS,MZ:MOZ,NA:NAM,NC:NCL,NE:NER,NF:NFK,NG:NGA,NI:NIC,NL:NLD,NO:NOR,NP:NPL,NR:NRU,NU:NIU,NZ:NZL,OM:OMN,PA:PAN,PE:PER,PF:PYF,PG:PNG,PH:PHL,PK:PAK,PL:POL,PM:SPM,PN:PCN,PR:PRI,PS:PSE,PT:PRT,PW:PLW,PY:PRY,QA:QAT,RE:REU,RO:ROU,RS:SRB,RU:RUS,RW:RWA,SA:SAU,SB:SLB,SC:SYC,SD:SDN,SE:SWE,SG:SGP,SH:SHN,SI:SVN,SJ:SJM,SK:SVK,SL:SLE,SM:SMR,SN:SEN,SO:SOM,SR:SUR,SS:SSD,ST:STP,SV:SLV,SX:SXM,SY:SYR,SZ:SWZ,TC:TCA,TD:TCD,TF:ATF,TG:TGO,TH:THA,TJ:TJK,TK:TKL,TL:TLS,TM:TKM,TN:TUN,TO:TON,TR:TUR,TT:TTO,TV:TUV,TW:TWN,TZ:TZA,UA:UKR,UG:UGA,UM:UMI,US:USA,UY:URY,UZ:UZB,VA:VAT,VC:VCT,VE:VEN,VG:VGB,VI:VIR,VN:VNM,VU:VUT,WF:WLF,WS:WSM,YE:YEM,YT:MYT,ZA:ZAF,ZM:ZMB,ZW:ZWE".split(",").forEach(function (part) {
    var entry = part.split(":"); map[entry[0]] = entry[1];
  });
  var cache = Object.create(null);
  function createSvg(feature) {
    var geometry = feature && (feature.geometry || (feature.features && feature.features[0] && feature.features[0].geometry));
    if (!geometry) throw Error("Contour manquant");
    var polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
    var coords = [];
    polygons.forEach(function (poly) { poly.forEach(function (ring) { ring.forEach(function (pt) {
      if (Array.isArray(pt) && Number.isFinite(pt[0]) && Number.isFinite(pt[1])) coords.push(pt);
    }); }); });
    if (!coords.length) throw Error("Pays sans coordonnées");
    var xs=coords.map(function(p){return p[0];}),ys=coords.map(function(p){return p[1];});
    var minX=Math.min.apply(null,xs),maxX=Math.max.apply(null,xs),minY=Math.min.apply(null,ys),maxY=Math.max.apply(null,ys);
    var scale=Math.min(120/Math.max(.001,maxX-minX),186/Math.max(.001,maxY-minY));
    var dx=120-(maxX-minX)*scale/2,dy=113-(maxY-minY)*scale/2;
    var path=polygons.map(function(poly){return poly.map(function(ring){return ring.map(function(pt,i){
      return (i?"L":"M")+(dx+(pt[0]-minX)*scale).toFixed(2)+" "+(220-dy-(pt[1]-minY)*scale).toFixed(2);
    }).join(" ")+"Z";}).join(" ");}).join(" ");
    var svgns="http://www.w3.org/2000/svg",svg=document.createElementNS(svgns,"svg");
    svg.setAttribute("viewBox","0 0 240 240");svg.setAttribute("role","img");svg.setAttribute("focusable","false");
    var defs=document.createElementNS(svgns,"defs");defs.innerHTML='<linearGradient id="af-market-country-green" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#37a84b"/><stop offset=".55" stop-color="#177a32"/><stop offset="1" stop-color="#084d25"/></linearGradient><linearGradient id="af-market-country-swoosh" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#ff9e24"/><stop offset=".5" stop-color="#ffce54"/><stop offset="1" stop-color="#41a83c"/></linearGradient>';
    svg.appendChild(defs);
    var country=document.createElementNS(svgns,"path");country.setAttribute("d",path);country.setAttribute("fill","url(#af-market-country-green)");country.setAttribute("stroke","#fff5da");country.setAttribute("stroke-width","1.7");country.setAttribute("stroke-linejoin","round");svg.appendChild(country);
    var ribbon=document.createElementNS(svgns,"path");ribbon.setAttribute("d","M20 150 C49 202 156 174 208 111");ribbon.setAttribute("fill","none");ribbon.setAttribute("stroke","#e8770e");ribbon.setAttribute("stroke-width","9");ribbon.setAttribute("stroke-linecap","round");svg.appendChild(ribbon);
    var upper=document.createElementNS(svgns,"path");upper.setAttribute("d","M21 145 C51 191 160 163 207 103");upper.setAttribute("fill","none");upper.setAttribute("stroke","url(#af-market-country-swoosh)");upper.setAttribute("stroke-width","9");upper.setAttribute("stroke-linecap","round");svg.appendChild(upper);
    var arrow=document.createElementNS(svgns,"path");arrow.setAttribute("d","M188 100 L227 81 L217 124 L207 109 Z");arrow.setAttribute("fill","#229d3b");svg.appendChild(arrow);
    return svg;
  }
  function mount(host, code, label) {
    if (!host) return;
    var iso2 = String(code || "").trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(iso2) || !map[iso2]) return;
    var iso3=map[iso2], seq=iso3;
    host.dataset.countryCode=iso2;
    host.setAttribute("aria-label","Emblème AfriFloW du marché "+(label || iso2));
    function show(feature){
      if (!host.isConnected || host.dataset.countryCode!==iso2) return;
      try { var svg=createSvg(feature);svg.setAttribute("aria-label","Silhouette du pays "+(label||iso2)+" avec flèche AfriFloW");host.replaceChildren(svg); }
      catch (error) { console.warn("Silhouette indisponible",error); }
    }
    if (cache[seq]) { show(cache[seq]);return; }
    fetch("https://raw.githubusercontent.com/johan/world.geo.json/master/countries/"+iso3+".geo.json")
      .then(function(res){if(!res.ok)throw Error("HTTP "+res.status);return res.json();})
      .then(function(feature){cache[seq]=feature;show(feature);})
      .catch(function(error){console.warn("Contour de marché introuvable; logo AfriFloW conservé.",iso2,error);});
  }
  window.AfriMarketCountryLogo={mount:mount};
})();
