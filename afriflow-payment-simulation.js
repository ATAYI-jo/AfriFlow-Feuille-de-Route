/* AfriFloW — local payment simulation only. No network, no real money. */
(function(root){
"use strict";
function createLedger(){
  const entries=new Map();
  return {
    create(reference,amount){
      reference=String(reference||"").trim();
      if(!/^[a-zA-Z0-9_-]{1,80}$/.test(reference)||!Number.isSafeInteger(amount)||amount<1||amount>100000000)throw new Error("Référence ou montant invalide.");
      const previous=entries.get(reference);
      if(previous){if(previous.amount!==amount)throw new Error("Référence déjà utilisée avec un autre montant.");return {...previous};}
      const row={reference,amount,currency:"XOF",mode:"simulation",status:"pending",createdAt:new Date().toISOString()};
      entries.set(reference,row);return {...row};
    },
    settle(reference,status){
      if(!["simulated_success","simulated_failure"].includes(status))throw new Error("Statut de test invalide.");
      const row=entries.get(reference);if(!row)throw new Error("Référence inconnue.");
      if(row.status!=="pending"&&row.status!==status)throw new Error("Transaction de test déjà clôturée.");
      if(row.status==="pending"){row.status=status;row.updatedAt=new Date().toISOString();}
      return {...row};
    },
    list(){return Array.from(entries.values(),row=>({...row}));}
  };
}
if(typeof module==="object"&&module.exports){module.exports={createLedger};return;}
const ledger=createLedger();
function mount(host){
  if(!host)return;
  host.innerHTML='<h3>Centre des paiements · Simulation</h3><p><strong>Mode test exclusivement.</strong> Aucun transfert, aucun appel à PayGate, aucune écriture dans la trésorerie réelle. Historique temporaire de cette session.</p><form data-payment-demo><label>Montant de test (FCFA) <input name="amount" type="number" min="1" max="100000000" step="1" required value="1000"></label> <label>Résultat <select name="result"><option value="simulated_success">Succès simulé</option><option value="simulated_failure">Échec simulé</option></select></label> <button type="submit">Simuler</button></form><p role="status" data-payment-status></p><div data-payment-history></div>';
  const status=host.querySelector("[data-payment-status]"),history=host.querySelector("[data-payment-history]");
  function render(){
    history.replaceChildren();
    const rows=ledger.list().reverse();
    if(!rows.length){history.textContent="Aucune simulation.";return;}
    rows.forEach(row=>{
      const p=document.createElement("p");
      p.textContent=row.reference+" · "+row.amount.toLocaleString("fr-FR")+" FCFA · "+(row.status==="simulated_success"?"Succès simulé":row.status==="simulated_failure"?"Échec simulé":"En attente");
      history.appendChild(p);
    });
  }
  host.querySelector("form").onsubmit=function(event){
    event.preventDefault();
    try{
      const data=new FormData(event.currentTarget),ref="TEST-"+crypto.randomUUID();
      ledger.create(ref,Number(data.get("amount")));
      ledger.settle(ref,String(data.get("result")));
      status.textContent="Simulation enregistrée (aucun argent réel).";render();
    }catch(error){status.textContent=error.message;}
  };
  render();
}
root.AfriPaymentSimulation={mount};
})(typeof window!=="undefined"?window:globalThis);
