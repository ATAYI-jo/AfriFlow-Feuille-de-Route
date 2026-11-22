/* ISO 3166-1 alpha-2 country codes, shared by the profile and market selectors. */
(function(){
"use strict";
var codes="AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" ");
var dn=typeof Intl.DisplayNames==="function"?new Intl.DisplayNames(["fr"],{type:"region"}):null;
var overrides={CI:"Côte d'Ivoire",TG:"Togo",BF:"Burkina Faso",FR:"France",BJ:"Bénin",CD:"République démocratique du Congo",CG:"Congo",US:"États-Unis"};
var countries=codes.map(function(code){return {code:code,name:overrides[code]||(dn?dn.of(code):code)}});
countries.sort(function(a,b){return a.name.localeCompare(b.name,"fr")});
window.AfriCountries={
  all:countries,
  has:function(code){return codes.indexOf(String(code||"").toUpperCase())>=0},
  name:function(code){var c=countries.find(function(x){return x.code===String(code||"").toUpperCase()});return c?c.name:""},
  match:function(name){var t=String(name||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase();
    var found=countries.find(function(x){return x.name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase()===t||x.code.toLowerCase()===t});
    return found?found.code:"";
  },
  options:function(current){return '<option value="">Sélectionnez un pays</option>'+countries.map(function(x){return '<option value="'+x.code+'"'+(current===x.code?' selected':'')+'>'+x.name+' ('+x.code+')</option>'}).join("")}
};
})();
